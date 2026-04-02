"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { downloadDocumentAssets } = require("./assets");
const {
  closeBrowserSession,
  getRuntimeBrowserOptions,
  normalizeBrowserOptions,
} = require("./browser");
const { normalizeItemShape } = require("./item-shape");
const { mergeDocuments } = require("./merge");
const {
  loadCurrentDocumentFromDb,
  persistSourceDocument,
} = require("./sqlite-store");
const { ensureSourceStorage, getSourceStoragePaths } = require("./storage");
const DEFAULT_SAVE_DIR = path.resolve(__dirname, "..", "var", "feed-archive");

function normalizeItem(item, index, sourceName) {
  return normalizeItemShape(item, { source: sourceName, index: index + 1 });
}

function normalizeDocument(document, sourceName) {
  if (!document || !Array.isArray(document.items)) {
    throw new Error(`Invalid ${sourceName} capture document`);
  }

  return {
    schema_version: 1,
    source: sourceName,
    captured_at: document.captured_at || new Date().toISOString(),
    items: document.items.map((item, index) =>
      normalizeItem(item, index, sourceName),
    ),
  };
}

async function persistCapturedDocument(
  document,
  { sourceName, assetsDir, saveDir },
) {
  let normalized = normalizeDocument(document, sourceName);
  if (assetsDir) {
    normalized = await downloadDocumentAssets(normalized, assetsDir);
  }

  const paths = getSourceStoragePaths(
    saveDir,
    sourceName,
    normalized.captured_at,
  );
  ensureSourceStorage(paths);
  const serialized = JSON.stringify(normalized, null, 2);
  fs.writeFileSync(paths.snapshotPath, serialized);
  fs.writeFileSync(paths.latestPath, serialized);

  let existingCurrent = loadCurrentDocumentFromDb(saveDir, sourceName);
  if (!existingCurrent) {
    try {
      existingCurrent = JSON.parse(fs.readFileSync(paths.currentPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const merged = mergeDocuments(existingCurrent, normalized);
  fs.writeFileSync(paths.currentPath, JSON.stringify(merged, null, 2));
  persistSourceDocument(saveDir, {
    sourceName,
    document: merged,
    snapshotPath: paths.snapshotPath,
    latestPath: paths.latestPath,
  });
  return merged;
}

async function runSourceCapture(adapter, options = {}) {
  const {
    limit = 12,
    assetsDir = "",
    saveDir = DEFAULT_SAVE_DIR,
    browserOptions = {},
  } = options;
  const normalizedBrowserOptions = normalizeBrowserOptions(browserOptions);
  const shouldResetSession =
    normalizedBrowserOptions.session &&
    normalizedBrowserOptions.autoConnect === false &&
    (normalizedBrowserOptions.statePath || normalizedBrowserOptions.profile);

  if (shouldResetSession) {
    closeBrowserSession(normalizedBrowserOptions);
  }

  const document = await adapter.captureDocument({
    limit,
    browserOptions: getRuntimeBrowserOptions(normalizedBrowserOptions),
  });
  return persistCapturedDocument(document, {
    sourceName: adapter.name,
    assetsDir,
    saveDir,
  });
}

module.exports = {
  runSourceCapture,
};
