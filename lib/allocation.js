"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getSaveDir } = require("./config");
const { loadAllocationFromDb, saveAllocationToDb } = require("./sqlite-store");
const { buildRows, resolveSelectionList } = require("./selection");

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
  const itemIds = new Set(
    (document.items || []).map((item) => item?.id).filter(Boolean),
  );
  const next = createEmptyAllocation(document.source);

  for (const allocation of allocations) {
    if (!allocation?.items) continue;
    for (const [itemId, entry] of Object.entries(allocation.items)) {
      if (itemIds.has(itemId)) next.items[itemId] = entry;
    }
  }

  return next;
}

function getDocumentSaveDirs(config, document) {
  const sources =
    document?.source === "combined"
      ? Array.from(
          new Set(
            (document.items || []).map((item) => item?.source).filter(Boolean),
          ),
        )
      : [document?.source].filter(Boolean);
  return Array.from(
    new Set(
      sources.map((source) => getSaveDir(config, source)).filter(Boolean),
    ),
  );
}

function loadAllocationFromDocument(document, explicitPath = null) {
  if (explicitPath) return loadAllocationFromPath(explicitPath);

  const config = loadConfig();
  const saveDirs = getDocumentSaveDirs(config, document);
  const allocations = saveDirs.map((saveDir) =>
    loadAllocationFromDb(saveDir, document),
  );
  return mergeAllocations(document, allocations);
}

function getItemCategory(allocation, item, fallbackCategory = "Other") {
  return allocation?.items?.[item.id]?.category || fallbackCategory;
}

function assignCategories(document, allocation, assignments) {
  const next = createEmptyAllocation(document.source);
  next.items = {
    ...(allocation?.items || {}),
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

  const config = loadConfig();
  const sources =
    document?.source === "combined"
      ? Array.from(
          new Set(
            (document.items || []).map((item) => item?.source).filter(Boolean),
          ),
        )
      : [document?.source].filter(Boolean);
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
  const { fallbackCategory = "Other", preferredCategories = [] } = options;
  const ids = resolveSelectionList(document, pickSpec);
  const groups = new Map();

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

function listUnclassifiedRows(document, allocation) {
  return buildRows(document).filter(
    ({ item }) => !allocation?.items || !allocation.items[item.id]?.category,
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
