"use strict";

const fs = require("node:fs");
const path = require("node:path");

function formatTimestamp(date) {
  return date
    .toISOString()
    .replace(/[:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
}

function getSourceStoragePaths(saveDir, sourceName, capturedAt) {
  const sourceRoot = path.join(saveDir, sourceName);
  const snapshotsDir = path.join(sourceRoot, "snapshots");
  const timestamp = formatTimestamp(new Date(capturedAt));
  return {
    sourceRoot,
    snapshotsDir,
    snapshotPath: path.join(
      snapshotsDir,
      `${sourceName}-feed-${timestamp}.json`,
    ),
    latestPath: path.join(sourceRoot, "latest.json"),
    currentPath: path.join(sourceRoot, "current.json"),
  };
}

function ensureSourceStorage(paths) {
  fs.mkdirSync(paths.snapshotsDir, { recursive: true });
}

module.exports = {
  getSourceStoragePaths,
  ensureSourceStorage,
};
