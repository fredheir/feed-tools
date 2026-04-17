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
 * @typedef {import("./item-shape").SelectionSpec} SelectionSpec
 * @typedef {import("./item-shape").AllocationEntry} AllocationEntry
 * @typedef {import("./item-shape").Allocation} Allocation
 * @typedef {import("./item-shape").CategoryAssignment} CategoryAssignment
 * @typedef {import("./item-shape").PickedGroup} PickedGroup
 */

function getSourceAllocationPath(config, sourceName) {
  const saveDir = getSaveDir(config, sourceName);
  return path.join(saveDir, sourceName, "allocation.json");
}

/**
 * @param {FeedDocument} document
 * @param {string|null} [explicitPath]
 * @returns {string}
 */
function getAllocationPath(document, explicitPath = null) {
  if (explicitPath) return explicitPath;
  const config = loadConfig();
  return getSourceAllocationPath(config, document.source);
}

/**
 * @param {string|null} [source]
 * @returns {Allocation}
 */
function createEmptyAllocation(source = null) {
  return { version: 1, source, items: {} };
}

/**
 * @param {Allocation|unknown} allocation
 * @returns {Object.<string, AllocationEntry>}
 */
function getAllocationItems(allocation) {
  return isPlainObject(allocation?.items) ? allocation.items : {};
}

/**
 * @param {string} allocationPath
 * @returns {Allocation}
 */
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

/**
 * @param {string} allocationPath
 * @param {Allocation} allocation
 */
function saveAllocationToPath(allocationPath, allocation) {
  fs.mkdirSync(path.dirname(allocationPath), { recursive: true });
  fs.writeFileSync(
    allocationPath,
    `${JSON.stringify(allocation, null, 2)}\n`,
    "utf8",
  );
}

/**
 * @param {FeedDocument} document
 * @param {Allocation[]} allocations
 * @returns {Allocation}
 */
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

/**
 * @param {object} config
 * @param {FeedDocument} document
 * @returns {string[]}
 */
function getDocumentSaveDirs(config, document) {
  const sources = getDocumentSources(document);
  return Array.from(
    new Set(
      sources.map((source) => getSaveDir(config, source)).filter(Boolean),
    ),
  );
}

/**
 * @param {FeedDocument} document
 * @param {string|null} [explicitPath]
 * @returns {Allocation}
 */
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

/**
 * @param {Allocation} allocation
 * @param {FeedItem} item
 * @param {string} [fallbackCategory]
 * @returns {string}
 */
function getItemCategory(allocation, item, fallbackCategory = "Other") {
  if (!item?.id) return fallbackCategory;
  return getAllocationItems(allocation)[item.id]?.category || fallbackCategory;
}

/**
 * @param {FeedDocument} document
 * @param {Allocation} allocation
 * @param {CategoryAssignment[]} assignments
 * @returns {Allocation}
 */
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

/**
 * @param {FeedDocument} document
 * @param {Allocation} allocation
 * @param {string|null} [explicitPath]
 * @returns {string}
 */
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

/**
 * @param {FeedDocument} document
 * @param {string|null} [explicitPath]
 * @returns {Allocation}
 */
function loadAllocationForDocument(document, explicitPath = null) {
  return loadAllocationFromDocument(document, explicitPath);
}

/**
 * @param {FeedDocument} document
 * @param {Allocation} allocation
 * @param {string|null} [explicitPath]
 * @returns {string}
 */
function saveAllocationForDocument(document, allocation, explicitPath = null) {
  return saveAllocationToDocument(document, allocation, explicitPath);
}

/**
 * @param {FeedDocument} document
 * @param {Allocation} allocation
 * @param {SelectionSpec} pickSpec
 * @param {{fallbackCategory?: string, preferredCategories?: string[]}} [options]
 * @returns {PickedGroup[]}
 */
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

/**
 * @param {FeedDocument} document
 * @param {Allocation} allocation
 * @returns {import("./item-shape").SelectionRow[]}
 */
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
