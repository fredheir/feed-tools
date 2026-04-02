"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { persistSourceDocument } = require("./sqlite-store");

function getBackfillSourcePath(saveDir, sourceName) {
  return path.join(saveDir, sourceName, "current.json");
}

function backfillSqliteFromCurrentJson(saveDir, sources) {
  const backfilled = [];
  const missing = [];

  for (const sourceName of sources) {
    const currentPath = getBackfillSourcePath(saveDir, sourceName);
    try {
      const document = JSON.parse(fs.readFileSync(currentPath, "utf8"));
      persistSourceDocument(saveDir, {
        sourceName,
        document,
        latestPath: path.join(saveDir, sourceName, "latest.json"),
      });
      backfilled.push({
        source: sourceName,
        path: currentPath,
        items: Array.isArray(document.items) ? document.items.length : 0,
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        missing.push({
          source: sourceName,
          path: currentPath,
        });
        continue;
      }
      throw error;
    }
  }

  return {
    backfilled,
    missing,
  };
}

module.exports = {
  backfillSqliteFromCurrentJson,
  getBackfillSourcePath,
};
