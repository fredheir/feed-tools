"use strict";

/**
 * Ingestion pipeline for Claude in Chrome captured data.
 *
 * Takes a raw JSON document (as produced by running an extraction script
 * in the browser via CiC javascript_tool), normalises it, merges with
 * any existing persisted state, downloads assets, and writes to sqlite.
 *
 * This reuses the same merge/persist infrastructure as the CDP path.
 */

const fs = require("node:fs");
const path = require("node:path");
const { downloadDocumentAssets } = require("../assets");
const { getPreferredItemKey, normalizeItemShape } = require("../item-shape");
const { mergeDocuments } = require("../merge");
const {
  loadCurrentDocumentFromDb,
  persistSourceDocument,
  loadAllocationFromDb,
} = require("../sqlite-store");
const { ensureSourceStorage, getSourceStoragePaths } = require("../storage");

const DEFAULT_SAVE_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "var",
  "feed-archive",
);

function normalizeDocument(document, sourceName) {
  if (!document || !Array.isArray(document.items)) {
    throw new Error(`Invalid ${sourceName} capture document`);
  }
  return {
    schema_version: 1,
    source: sourceName,
    captured_at: document.captured_at || new Date().toISOString(),
    items: document.items.map((item, index) =>
      normalizeItemShape(item, { source: sourceName, index: index + 1 }),
    ),
  };
}

function deduplicateItems(items, sourceName) {
  const seen = new Set();
  const unique = [];
  for (const item of items || []) {
    const key = getPreferredItemKey(item, {
      source: sourceName,
      index: item.index,
    });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

async function ingestDocument(rawDocument, { sourceName, assetsDir, saveDir }) {
  const effectiveSaveDir = saveDir || DEFAULT_SAVE_DIR;
  let normalized = normalizeDocument(rawDocument, sourceName);
  normalized.items = deduplicateItems(normalized.items, sourceName);

  if (assetsDir) {
    normalized = await downloadDocumentAssets(normalized, assetsDir);
  }

  const paths = getSourceStoragePaths(
    effectiveSaveDir,
    sourceName,
    normalized.captured_at,
  );
  ensureSourceStorage(paths);
  const serialized = JSON.stringify(normalized, null, 2);
  fs.writeFileSync(paths.snapshotPath, serialized);
  fs.writeFileSync(paths.latestPath, serialized);

  let existingCurrent = loadCurrentDocumentFromDb(effectiveSaveDir, sourceName);
  if (!existingCurrent) {
    try {
      existingCurrent = JSON.parse(fs.readFileSync(paths.currentPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const merged = mergeDocuments(existingCurrent, normalized);
  fs.writeFileSync(paths.currentPath, JSON.stringify(merged, null, 2));
  persistSourceDocument(effectiveSaveDir, {
    sourceName,
    document: merged,
    snapshotPath: paths.snapshotPath,
    latestPath: paths.latestPath,
  });
  return merged;
}

function hasNewUnclassifiedItems(document, saveDir) {
  const effectiveSaveDir = saveDir || DEFAULT_SAVE_DIR;
  const allocation = loadAllocationFromDb(effectiveSaveDir, document);
  return (document.items || []).some(
    (item) =>
      item.capture_count === 1 &&
      item.last_seen_at === document.captured_at &&
      !allocation?.items?.[item.id]?.category,
  );
}

module.exports = {
  hasNewUnclassifiedItems,
  ingestDocument,
};
