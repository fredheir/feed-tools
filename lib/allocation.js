"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getCaptureDefaults, getSources } = require("./config");
const { buildRows, resolveSelectionList } = require("./selection");

function getSourceAllocationPath(config, sourceName) {
  const saveDir =
    getCaptureDefaults(config, sourceName).save_dir || "/tmp/feed-archive";
  return path.join(saveDir, sourceName, "allocation.json");
}

function getAllocationPath(document, explicitPath = null) {
  if (explicitPath) return explicitPath;
  const config = loadConfig();
  return getSourceAllocationPath(config, document.source);
}

function loadAllocation(allocationPath) {
  try {
    return JSON.parse(fs.readFileSync(allocationPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { version: 1, source: null, items: {} };
    }
    throw error;
  }
}

function saveAllocation(allocationPath, allocation) {
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
  const next = {
    version: 1,
    source: document.source,
    items: {},
  };

  for (const allocation of allocations) {
    if (!allocation?.items) continue;
    for (const [itemId, entry] of Object.entries(allocation.items)) {
      if (itemIds.has(itemId)) next.items[itemId] = entry;
    }
  }

  return next;
}

function loadAllocationForDocument(document, explicitPath = null) {
  if (explicitPath) return loadAllocation(explicitPath);
  if (document?.source !== "combined") {
    return loadAllocation(getAllocationPath(document, explicitPath));
  }

  const config = loadConfig();
  const documentSources = new Set(
    (document.items || []).map((item) => item?.source).filter(Boolean),
  );
  const allocations = getSources(config)
    .filter((source) => documentSources.has(source.name))
    .map((source) =>
      loadAllocation(getSourceAllocationPath(config, source.name)),
    );
  return mergeAllocations(document, allocations);
}

function getItemCategory(allocation, item, fallbackCategory = "Other") {
  return allocation?.items?.[item.id]?.category || fallbackCategory;
}

function assignCategories(document, allocation, assignments) {
  const next = {
    version: 1,
    source: document.source,
    items: {
      ...(allocation?.items || {}),
    },
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
  getAllocationPath,
  getSourceAllocationPath,
  groupPickedRowsByCategory,
  loadAllocation,
  loadAllocationForDocument,
  mergeAllocations,
  saveAllocation,
};
