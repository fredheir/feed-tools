"use strict";

/**
 * Normalises CiC output and persists it through the shared capture pipeline.
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
