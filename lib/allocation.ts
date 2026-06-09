import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SAVE_DIR, loadConfig, getSaveDir } from "./config.ts";
import { getDocumentSources } from "./document-sources.ts";
import { loadAllocationFromDb, saveAllocationToDb } from "./sqlite-store.ts";
import { resolveSelectionList } from "./selection.ts";
import { assertFeedDocument, isPlainObject } from "./item-shape.ts";
import type {
  CategoryAssignment,
  FeedAllocation,
  FeedConfig,
  FeedDocument,
  FeedItem,
  FeedTab,
} from "./types.ts";

function createEmptyAllocation(source: string | null = null): FeedAllocation {
  return { version: 1, source, items: {} };
}

function getAllocationItems(
  allocation: FeedAllocation | null | undefined,
): FeedAllocation["items"] {
  return allocation && isPlainObject(allocation.items)
    ? (allocation.items as FeedAllocation["items"])
    : {};
}

function loadAllocationFromPath(allocationPath: string): FeedAllocation {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(allocationPath, "utf8"),
    ) as unknown;
    if (!isPlainObject(parsed)) {
      throw new Error(`Invalid allocation object: ${allocationPath}`);
    }
    const version = typeof parsed.version === "number" ? parsed.version : 1;
    const source = typeof parsed.source === "string" ? parsed.source : null;
    return {
      version,
      source,
      items: getAllocationItems({
        version,
        source,
        items: parsed.items,
      } as unknown as FeedAllocation),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyAllocation();
    }
    throw error;
  }
}

function saveAllocationToPath(
  allocationPath: string,
  allocation: FeedAllocation,
): void {
  fs.mkdirSync(path.dirname(allocationPath), { recursive: true });
  fs.writeFileSync(
    allocationPath,
    `${JSON.stringify(allocation, null, 2)}\n`,
    "utf8",
  );
}

function mergeAllocations(
  document: FeedDocument,
  allocations: FeedAllocation[],
): FeedAllocation {
  assertFeedDocument(document, "mergeAllocations");
  if (!Array.isArray(allocations)) {
    throw new Error("Expected allocations array");
  }

  const itemIds = new Set(
    document.items
      .map((item) => item.id)
      .filter((itemId): itemId is string => Boolean(itemId)),
  );
  const next = createEmptyAllocation(document.source);

  for (const allocation of allocations) {
    const allocationItems = getAllocationItems(allocation);
    for (const [itemId, entry] of Object.entries(allocationItems)) {
      if (itemIds.has(itemId)) next.items[itemId] = entry;
    }
  }

  return next;
}

function getDocumentSaveDirs(
  config: FeedConfig,
  document: FeedDocument,
): string[] {
  const sources = getDocumentSources(document);
  return Array.from(
    new Set(
      sources
        .map((source: string) => getSaveDir(config, source))
        .filter(Boolean),
    ),
  );
}

function loadAllocationFromDocument(
  document: FeedDocument,
  explicitPath: string | null = null,
): FeedAllocation {
  if (explicitPath) return loadAllocationFromPath(explicitPath);

  assertFeedDocument(document, "loadAllocationFromDocument");
  const config = loadConfig();
  const saveDirs = getDocumentSaveDirs(config, document);
  const allocations = saveDirs.map((saveDir) =>
    loadAllocationFromDb(saveDir, document),
  );
  return mergeAllocations(document, allocations);
}

function getItemCategory(
  allocation: FeedAllocation | null | undefined,
  item: FeedItem,
  fallbackCategory = "Other",
): string {
  if (!item.id) return fallbackCategory;
  return getAllocationItems(allocation)[item.id]?.category || fallbackCategory;
}

function assignCategories(
  document: FeedDocument,
  allocation: FeedAllocation | null | undefined,
  assignments: CategoryAssignment[],
): FeedAllocation {
  assertFeedDocument(document, "assignCategories");
  if (!Array.isArray(assignments)) {
    throw new Error("Expected category assignments array");
  }

  const next = createEmptyAllocation(document.source);
  next.items = {
    ...getAllocationItems(allocation),
  };

  for (const assignment of assignments) {
    const ids = resolveSelectionList(document, assignment.selection);
    for (const id of ids) {
      next.items[id] = {
        category: assignment.category,
        updated_at: new Date().toISOString(),
      };
    }
  }

  return next;
}

function saveAllocationToDocument(
  document: FeedDocument,
  allocation: FeedAllocation,
  explicitPath: string | null = null,
): string {
  if (explicitPath) {
    saveAllocationToPath(explicitPath, allocation);
    return path.resolve(explicitPath);
  }

  assertFeedDocument(document, "saveAllocationToDocument");
  const config = loadConfig();
  const sources = getDocumentSources(document);
  const resolvedLocations = new Set<string>();

  for (const sourceName of sources) {
    const sourceDocument =
      document.source === "combined"
        ? {
            ...document,
            source: sourceName,
            items: document.items.filter((item) => item.source === sourceName),
          }
        : document;
    const sourceAllocation = mergeAllocations(sourceDocument, [allocation]);
    const saveDir = getSaveDir(config, sourceName);
    saveAllocationToDb(saveDir, sourceDocument, sourceAllocation);
    resolvedLocations.add(path.resolve(saveDir, "feed.sqlite"));
  }

  return Array.from(resolvedLocations).join("\n");
}

function hasNewUnclassifiedItems(
  document: FeedDocument,
  saveDir: string,
): boolean {
  const allocation = loadAllocationFromDb(
    saveDir || DEFAULT_SAVE_DIR,
    document,
  );
  return document.items.some(
    (item) =>
      item.capture_count === 1 &&
      item.last_seen_at === document.captured_at &&
      Boolean(item.id) &&
      !allocation?.items?.[item.id as string]?.category,
  );
}

function groupPickedRowsByCategory(
  document: FeedDocument,
  allocation: FeedAllocation | null | undefined,
  pickSpec: string | string[],
  options: {
    fallbackCategory?: string;
    preferredCategories?: string[];
  } = {},
): FeedTab[] {
  assertFeedDocument(document, "groupPickedRowsByCategory");
  const { fallbackCategory = "Other", preferredCategories = [] } = options;
  const ids = resolveSelectionList(document, pickSpec);
  const groups = new Map<string, string[]>();

  for (const id of ids) {
    const item = document.items.find((entry) => entry.id === id);
    if (!item) continue;
    const category = getItemCategory(allocation, item, fallbackCategory);
    const bucket = groups.get(category) || [];
    bucket.push(id);
    groups.set(category, bucket);
  }

  const orderedLabels = [
    ...preferredCategories.filter((label) => groups.has(label)),
    ...Array.from(groups.keys()).filter(
      (label) => !preferredCategories.includes(label),
    ),
  ];

  return orderedLabels.map((label) => ({
    label,
    groups: [
      {
        label,
        item_ids: groups.get(label) || [],
      },
    ],
  }));
}

export {
  assignCategories,
  groupPickedRowsByCategory,
  hasNewUnclassifiedItems,
  loadAllocationFromPath,
  loadAllocationFromDocument,
  mergeAllocations,
  saveAllocationToPath,
  saveAllocationToDocument,
};
