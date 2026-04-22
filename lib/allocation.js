"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getSaveDir } = require("./config");
const { getDocumentSources } = require("./document-sources");
const { loadAllocationFromDb, saveAllocationToDb } = require("./sqlite-store");
const { buildRows, resolveSelectionList } = require("./selection");
const { assertFeedDocument, isPlainObject } = require("./item-shape");

/**
 * @typedef {import("./item-shape").FeedDocument} FeedDocument
 * @typedef {import("./item-shape").FeedItem} FeedItem
 * @typedef {Object} AllocationEntry
 * @property {string} category
 * @property {string} [updated_at]
 * @typedef {Object} Allocation
 * @property {number} version
 * @property {string|null} source
 * @property {Object.<string, AllocationEntry>} items
 * @typedef {Object} CategoryAssignment
 * @property {string} category
 * @property {string|Array<string>} selection
 * @typedef {Object} PickedGroup
 * @property {string} label
 * @property {string[]} item_ids
 */

function getSourceAllocationPath(config, sourceName) {
  const saveDir = getSaveDir(config, sourceName);
  return path.join(saveDir, sourceName, "allocation.json");
}

function getAllocationPath(document, explicitPath = null) {
  if (explicitPath) return explicitPath;
  const config = loadConfig();
  return getSourceAllocationPath(config, document.source);
}

function createEmptyAllocation(source = null) {
  return { version: 1, source, items: {} };
}

function getAllocationItems(allocation) {
  return isPlainObject(allocation?.items) ? allocation.items : {};
}

function loadAllocationFromPath(allocationPath) {
  try {
    return JSON.parse(fs.readFileSync(allocationPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return createEmptyAllocation();
    }
    throw error;
  }
}

function saveAllocationToPath(allocationPath, allocation) {
  fs.mkdirSync(path.dirname(allocationPath), { recursive: true });
  fs.writeFileSync(
    allocationPath,
    `${JSON.stringify(allocation, null, 2)}\n`,
    "utf8",
  );
}

function mergeAllocations(document, allocations) {
  assertFeedDocument(document, "mergeAllocations");
  if (!Array.isArray(allocations)) {
    throw new Error("Expected allocations array");
  }

  const itemIds = new Set(
    document.items.map((item) => item?.id).filter(Boolean),
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

function getDocumentSaveDirs(config, document) {
  const sources = getDocumentSources(document);
  return Array.from(
    new Set(
      sources.map((source) => getSaveDir(config, source)).filter(Boolean),
    ),
  );
}

function loadAllocationFromDocument(document, explicitPath = null) {
  if (explicitPath) return loadAllocationFromPath(explicitPath);

  assertFeedDocument(document, "loadAllocationFromDocument");
  const config = loadConfig();
  const saveDirs = getDocumentSaveDirs(config, document);
  const allocations = saveDirs.map((saveDir) =>
    loadAllocationFromDb(saveDir, document),
  );
  return mergeAllocations(document, allocations);
}

function getItemCategory(allocation, item, fallbackCategory = "Other") {
  if (!item?.id) return fallbackCategory;
  return getAllocationItems(allocation)[item.id]?.category || fallbackCategory;
}

function assignCategories(document, allocation, assignments) {
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

function saveAllocationToDocument(document, allocation, explicitPath = null) {
  if (explicitPath) {
    saveAllocationToPath(explicitPath, allocation);
    return path.resolve(explicitPath);
  }

  assertFeedDocument(document, "saveAllocationToDocument");
  const config = loadConfig();
  const sources = getDocumentSources(document);
  const resolvedLocations = new Set();

  for (const sourceName of sources) {
    const sourceDocument =
      document?.source === "combined"
        ? {
            ...document,
            source: sourceName,
            items: (document.items || []).filter(
              (item) => item?.source === sourceName,
            ),
          }
        : document;
    const sourceAllocation = mergeAllocations(sourceDocument, [allocation]);
    const saveDir = getSaveDir(config, sourceName);
    saveAllocationToDb(saveDir, sourceDocument, sourceAllocation);
    resolvedLocations.add(path.resolve(saveDir, "feed.sqlite"));
  }

  return Array.from(resolvedLocations).join("\n");
}

function loadAllocationForDocument(document, explicitPath = null) {
  return loadAllocationFromDocument(document, explicitPath);
}

function saveAllocationForDocument(document, allocation, explicitPath = null) {
  return saveAllocationToDocument(document, allocation, explicitPath);
}

function groupPickedRowsByCategory(
  document,
  allocation,
  pickSpec,
  options = {},
) {
  assertFeedDocument(document, "groupPickedRowsByCategory");
  const { fallbackCategory = "Other", preferredCategories = [] } = options;
  const ids = resolveSelectionList(document, pickSpec);
  const groups = new Map();

  for (const id of ids) {
    const item = document.items.find((entry) => entry?.id === id);
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

function listUnclassifiedRows(document, allocation) {
  assertFeedDocument(document, "listUnclassifiedRows");
  const allocationItems = getAllocationItems(allocation);
  return buildRows(document).filter(
    ({ item }) => !allocationItems[item.id]?.category,
  );
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
