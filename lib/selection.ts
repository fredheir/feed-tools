import * as fs from "node:fs";

import { assertFeedDocument, normalizeItemShape } from "./item-shape.js";
import type {
  CurationPreferences,
  FeedAllocation,
  FeedDocument,
  FeedItem,
} from "./types.js";

interface SelectionRow {
  row: number;
  item: FeedItem;
}

type SelectionSpec = string | string[];
type PartialFeedDocument = Partial<FeedDocument> & { items?: unknown[] };

function normalizeSelectionDocument(
  document: unknown,
  context: string,
): FeedDocument {
  assertFeedDocument(document, context);
  const candidate = document as PartialFeedDocument;
  const items = Array.isArray(candidate.items) ? candidate.items : [];
  const source =
    typeof candidate.source === "string" ? candidate.source : "unknown";
  return {
    schema_version:
      typeof candidate.schema_version === "number"
        ? candidate.schema_version
        : 1,
    source,
    captured_at:
      typeof candidate.captured_at === "string" ? candidate.captured_at : null,
    items: items.map((item, index) => {
      const candidateItem = (item ?? {}) as Partial<FeedItem>;
      const legacyItem = (item ?? {}) as { text?: unknown };
      const contentText =
        typeof candidateItem.content?.text === "string"
          ? candidateItem.content.text
          : typeof legacyItem.text === "string"
            ? legacyItem.text
            : undefined;
      return normalizeItemShape(
        contentText === undefined
          ? candidateItem
          : {
              ...candidateItem,
              content: {
                ...candidateItem.content,
                text: contentText,
              },
            },
        {
          source,
          index: index + 1,
        },
      );
    }),
  };
}

function hasPositiveLimit(limit: number | null | undefined): limit is number {
  return typeof limit === "number" && Number.isInteger(limit) && limit > 0;
}

export function loadDocument(inputPath: string): FeedDocument {
  const document = JSON.parse(fs.readFileSync(inputPath, "utf8")) as unknown;
  return normalizeSelectionDocument(document, "loadDocument");
}

export function buildRows(document: FeedDocument): SelectionRow[] {
  return document.items.map((item, index) => ({
    row: index + 1,
    item,
  }));
}

function summarizeText(value: unknown, maxLength = 110): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getItemHandle(item: FeedItem): string {
  return item.author?.handle || "";
}

function getItemText(item: FeedItem): string {
  return item.content?.text || "";
}

function getItemStatsSummary(item: FeedItem): string {
  const stats = item.stats || {
    like: null,
    share: null,
    view: null,
  };
  return `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`;
}

function normalizeSelectionSpec(spec: SelectionSpec): string[] {
  if (Array.isArray(spec)) {
    return spec.map((value) => String(value).trim()).filter(Boolean);
  }

  return String(spec || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function printRowsWithAllocation(
  document: FeedDocument,
  allocation: FeedAllocation | null,
  options: {
    limit?: number | null;
    unclassifiedOnly?: boolean;
    fallbackCategory?: string;
  } = {},
): string {
  const {
    limit,
    unclassifiedOnly = false,
    fallbackCategory = "Other",
  } = options;
  let rows = buildRows(document);
  if (unclassifiedOnly) {
    rows = rows.filter(
      ({ item }) =>
        !item.id || !allocation?.items || !allocation.items[item.id]?.category,
    );
  }
  const selectedRows = hasPositiveLimit(limit) ? rows.slice(0, limit) : rows;
  return selectedRows
    .map(({ row, item }) => {
      const category =
        (item.id && allocation?.items?.[item.id]?.category) || fallbackCategory;
      return [
        row,
        item.id || "",
        category,
        getItemHandle(item),
        summarizeText(getItemText(item)),
        getItemStatsSummary(item),
      ].join("\t");
    })
    .join("\n");
}

export function printClassificationRows(
  document: FeedDocument,
  allocation: FeedAllocation | null,
  options: { limit?: number | null } = {},
): string {
  const { limit } = options;
  let rows = buildRows(document).filter(
    ({ item }) =>
      !item.id || !allocation?.items || !allocation.items[item.id]?.category,
  );
  if (hasPositiveLimit(limit)) {
    rows = rows.slice(0, limit);
  }
  return rows
    .map(({ row, item }) => {
      return [
        row,
        item.source || document.source || "",
        item.id || "",
        getItemHandle(item),
        summarizeText(getItemText(item), 140),
        getItemStatsSummary(item),
        item.url || "",
      ].join("\t");
    })
    .join("\n");
}

export function buildClassificationPrompt(
  curation: CurationPreferences = {},
): string {
  const categories = Array.isArray(curation.preferred_categories)
    ? curation.preferred_categories.filter(Boolean)
    : [];
  const fallback = curation.fallback_category || "Other";
  const categoryLine =
    categories.length > 0
      ? `Requested categories: ${categories.join(", ")}. Fallback: ${fallback}.`
      : `Requested categories: ${fallback}.`;
  return `ERROR: classification step incomplete. ${categoryLine} Please classify each post below against the config curation preferences and relevance policy, then run feed-classify --category Label:rows with explicit row assignments only.`;
}

function resolveSelectionToken(
  document: FeedDocument,
  token: string,
): string | null {
  const value = String(token).trim();
  if (!value) return null;

  const rows = buildRows(document);
  if (/^\d+$/.test(value)) {
    const row = Number.parseInt(value, 10);
    return rows.find((entry) => entry.row === row)?.item.id || null;
  }

  return rows.find((entry) => entry.item.id === value)?.item.id || null;
}

export function resolveSelectionList(
  document: FeedDocument,
  spec: SelectionSpec,
): string[] {
  const tokens = normalizeSelectionSpec(spec);
  const allRows = buildRows(document)
    .map((entry) => entry.item.id)
    .filter((value): value is string => Boolean(value));

  if (tokens.length === 1 && tokens[0] === "all") {
    return allRows;
  }

  const explicit = tokens
    .filter((value) => value.toLowerCase() !== "all")
    .map((value) => resolveSelectionToken(document, value))
    .filter((value): value is string => Boolean(value));

  if (!tokens.some((value) => value.toLowerCase() === "all")) {
    return explicit;
  }

  const seen = new Set(explicit);
  const remaining = allRows.filter((id) => !seen.has(id));
  return explicit.concat(remaining);
}
