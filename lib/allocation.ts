"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getSaveDir } = require("./config");
const { getDocumentSources } = require("./document-sources");
const { loadAllocationFromDb, saveAllocationToDb } = require("./sqlite-store");
const { resolveSelectionList } = require("./selection");
const { assertFeedDocument, isPlainObject } = require("./item-shape");
import type {
  CategoryAssignment,
  FeedAllocation,
  FeedDocument,
  FeedItem,
  FeedTab,
} from "./types.js";

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
    return JSON.parse(
      fs.readFileSync(allocationPath, "utf8"),
    ) as FeedAllocation;
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
  config: unknown,
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

function loadAllocationForDocument(
  document: FeedDocument,
  explicitPath: string | null = null,
): FeedAllocation {
  return loadAllocationFromDocument(document, explicitPath);
}

function saveAllocationForDocument(
  document: FeedDocument,
  allocation: FeedAllocation,
  explicitPath: string | null = null,
): string {
  return saveAllocationToDocument(document, allocation, explicitPath);
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

module.exports = {
  assignCategories,
  groupPickedRowsByCategory,
  loadAllocation: loadAllocationFromPath,
  loadAllocationFromPath,
  loadAllocationFromDocument,
  loadAllocationForDocument,
  mergeAllocations,
  saveAllocation: saveAllocationToPath,
  saveAllocationToPath,
  saveAllocationToDocument,
  saveAllocationForDocument,
};
