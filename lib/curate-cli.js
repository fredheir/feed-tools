#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getEnabledSourceNames, getSaveDir } = require("./config");
const {
  exportDocumentsFromDb,
  listStoredSources,
  loadAllocationFromDb,
} = require("./sqlite-store");
const { printRows, printRowsWithAllocation } = require("./selection");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-curate <output-json> [--source NAME]... [--save-dir DIR] [--limit N] [--exclude-seen] [--exclude-completed] [--unclassified]",
  );
  process.exit(0);
}

const outputPath = process.argv[2];
const config = loadConfig();
let saveDir = getSaveDir(config);
let limit = null;
let excludeSeen = false;
let excludeCompleted = false;
let unclassifiedOnly = false;
const sources = [];

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--source") {
    sources.push(process.argv[index + 1]);
    index += 1;
    continue;
  }
  if (arg === "--save-dir") {
    saveDir = process.argv[index + 1] || saveDir;
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
  if (arg === "--unclassified") {
    unclassifiedOnly = true;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

let selectedSources = sources.filter(Boolean);
if (selectedSources.length === 0) {
  const orderedConfiguredSources = getEnabledSourceNames(config);
  const stored = new Set(listStoredSources(saveDir));
  selectedSources = orderedConfiguredSources.filter((source) =>
    stored.has(source),
  );
}

const document = exportDocumentsFromDb(saveDir, {
  sources: selectedSources,
  limit,
  excludeSeen,
  excludeCompleted,
});
fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

const allocation = loadAllocationFromDb(saveDir, document);
const listing = allocation
  ? printRowsWithAllocation(document, allocation, {
      limit,
      unclassifiedOnly,
    })
  : printRows(document, { limit });

process.stdout.write(`${path.resolve(outputPath)}\n`);
if (listing) process.stdout.write(`${listing}\n`);
