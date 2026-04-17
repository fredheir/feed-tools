"use strict";

/**
 * Ingestion pipeline for Claude in Chrome captured data.
 *
 * Takes a raw JSON document (as produced by running an extraction script
 * in the browser via CiC javascript_tool), normalises it, merges with
 * any existing persisted state, downloads assets, and writes to sqlite.
 *
 * Reuses the same merge/persist infrastructure as the CDP path via
 * lib/source-capture.js; the only CiC-specific step is deduplication
 * of the raw extracted items before persistence.
 */

const { DEFAULT_SAVE_DIR } = require("../config");
const {
  collectUniqueItems,
  normalizeDocument,
  persistCapturedDocument,
} = require("../source-capture");

async function ingestDocument(rawDocument, { sourceName, assetsDir, saveDir }) {
  const normalized = normalizeDocument(rawDocument, sourceName);
  const dedupedItems = collectUniqueItems(normalized.items, {
    seen: new Set(),
    sourceName,
  });
  return persistCapturedDocument(
    { ...normalized, items: dedupedItems },
    {
      sourceName,
      assetsDir,
      saveDir: saveDir || DEFAULT_SAVE_DIR,
    },
  );
}

module.exports = {
  ingestDocument,
};
