#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const { downloadMissingVideoAssets } = require("./assets.js");
const {
  loadCurrentDocumentFromDb,
  persistSourceDocument,
} = require("./sqlite-store.js");
const { getSourceStoragePaths } = require("./storage.js");
import type { FeedDocument } from "./types.js";

export async function enrichSourceVideos(options: {
  sourceName: string;
  saveDir: string;
  assetsDir: string;
}): Promise<FeedDocument> {
  const currentDocument = loadCurrentDocumentFromDb(
    options.saveDir,
    options.sourceName,
  );
  if (!currentDocument) {
    throw new Error(`No stored document for source ${options.sourceName}`);
  }

  const enrichedDocument = await downloadMissingVideoAssets(
    currentDocument,
    options.assetsDir,
  );
  const paths = getSourceStoragePaths(
    options.saveDir,
    options.sourceName,
    enrichedDocument.captured_at || new Date().toISOString(),
  );
  fs.writeFileSync(
    paths.currentPath,
    JSON.stringify(enrichedDocument, null, 2),
  );
  fs.writeFileSync(paths.latestPath, JSON.stringify(enrichedDocument, null, 2));
  persistSourceDocument(options.saveDir, {
    sourceName: options.sourceName,
    document: enrichedDocument,
    latestPath: paths.latestPath,
  });
  return enrichedDocument;
}

module.exports = {
  enrichSourceVideos,
};
