#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getSaveDir } = require("./config");
const { exportDocumentsFromDb } = require("./sqlite-store");
const {
  appendCommaList,
  resolveSelectedSources,
} = require("./source-selection");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-export <output-json> [--sources name1,name2,...] [--save-dir DIR] [--limit N] [--exclude-seen] [--exclude-completed]",
  );
  process.exit(0);
}

const outputPath = process.argv[2];
let saveDir = null;
let limit = null;
let excludeSeen = false;
let excludeCompleted = false;
let sources = [];

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--sources" || arg === "--source") {
    sources = appendCommaList(sources, process.argv[index + 1]);
    index += 1;
    continue;
  }
  if (arg === "--save-dir") {
    saveDir = process.argv[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--limit") {
    limit = Number.parseInt(process.argv[index + 1] || "", 10);
    index += 1;
    continue;
  }
  if (arg === "--exclude-seen") {
    excludeSeen = true;
    continue;
  }
  if (arg === "--exclude-completed") {
    excludeCompleted = true;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const config = loadConfig();
saveDir = saveDir || getSaveDir(config);
const selectedSources = resolveSelectedSources(config, saveDir, sources);

const document = exportDocumentsFromDb(saveDir, {
  sources: selectedSources,
  limit,
  excludeSeen,
  excludeCompleted,
});

fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(path.resolve(outputPath));
