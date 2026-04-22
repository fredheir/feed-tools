import { assertFeedDocument, normalizeItemShape } from "./item-shape.js";
import type { FeedDocument, FeedItem } from "./types.js";

type PartialFeedDocument = Partial<FeedDocument> & { items?: unknown[] };

interface NormalizeBoundaryItemOptions {
  includeCaptureMetadata?: boolean;
}

interface NormalizeBoundaryDocumentOptions {
  source: string;
  schemaVersion?: number;
  capturedAt?: FeedDocument["captured_at"];
  includeCaptureMetadata?: boolean;
  normalizeItem?: (
    item: unknown,
    fallback: { source: string; index: number },
  ) => FeedItem;
}

function resolveContentText(
  candidate: Partial<FeedItem>,
  raw: unknown,
): string | undefined {
  if (typeof candidate.content?.text === "string")
    return candidate.content.text;
  const topLevelText = (raw as { text?: unknown } | null | undefined)?.text;
  return typeof topLevelText === "string" ? topLevelText : undefined;
}

export function normalizeBoundaryItem(
  item: unknown,
  fallback: { source: string; index: number },
  options: NormalizeBoundaryItemOptions = {},
): FeedItem {
  const { includeCaptureMetadata = false } = options;
  const candidate = (item ?? {}) as Partial<FeedItem>;
  const contentText = resolveContentText(candidate, item);
  const normalized = normalizeItemShape(
    contentText === undefined
      ? candidate
      : {
          ...candidate,
          content: {
            ...candidate.content,
            text: contentText,
          },
        },
    fallback,
  );
  if (!includeCaptureMetadata) return normalized;
  return {
    ...normalized,
    first_seen_at:
      typeof candidate.first_seen_at === "string"
        ? candidate.first_seen_at
        : null,
    last_seen_at:
      typeof candidate.last_seen_at === "string"
        ? candidate.last_seen_at
        : null,
    capture_count:
      typeof candidate.capture_count === "number"
        ? candidate.capture_count
        : null,
  };
}

export function buildNormalizedFeedDocument(
  document: PartialFeedDocument,
  {
    source,
    schemaVersion = 1,
    capturedAt = null,
    includeCaptureMetadata = false,
    normalizeItem = (item, fallback) =>
      normalizeBoundaryItem(item, fallback, {
        includeCaptureMetadata,
      }),
  }: NormalizeBoundaryDocumentOptions,
): FeedDocument {
  const items = Array.isArray(document.items) ? document.items : [];
  return {
    schema_version: schemaVersion,
    source,
    captured_at: capturedAt,
    items: items.map((item, index) =>
      normalizeItem(item, {
        source,
        index: index + 1,
      }),
    ),
  };
}

export function normalizePersistedDocument(
  document: unknown,
  options: {
    context: string;
    fallbackSource?: string;
    includeCaptureMetadata?: boolean;
  },
): FeedDocument {
  assertFeedDocument(document, options.context);
  const candidate = document as PartialFeedDocument;
  return buildNormalizedFeedDocument(candidate, {
    source:
      typeof candidate.source === "string"
        ? candidate.source
        : options.fallbackSource || "unknown",
    schemaVersion:
      typeof candidate.schema_version === "number"
        ? candidate.schema_version
        : 1,
    capturedAt:
      typeof candidate.captured_at === "string" ? candidate.captured_at : null,
    includeCaptureMetadata: options.includeCaptureMetadata,
  });
}

module.exports = {
  buildNormalizedFeedDocument,
  normalizeBoundaryItem,
  normalizePersistedDocument,
};
