#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getEnabledSources } = require("./config");
const { exportDocumentsFromDb, listStoredSources } = require("./sqlite-store");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-export <output-json> [--source NAME]... [--save-dir DIR] [--limit N] [--exclude-seen] [--exclude-completed]",
  );
  process.exit(0);
}

const outputPath = process.argv[2];
let saveDir = null;
let limit = null;
let excludeSeen = false;
let excludeCompleted = false;
const sources = [];

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--source") {
    sources.push(process.argv[index + 1]);
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

if (!saveDir) {
  const config = loadConfig();
  const defaultSource = getEnabledSources(config)[0] || null;
  saveDir =
    defaultSource?.capture?.save_dir ||
    config?.user_preferences?.sources?.[0]?.capture?.save_dir ||
    "/tmp/feed-archive";
}

let selectedSources = sources.filter(Boolean);
if (selectedSources.length === 0) {
  try {
    const config = loadConfig();
    const orderedConfiguredSources = getEnabledSources(config)
      .map((source) => source.name)
      .filter(Boolean);
    const stored = new Set(listStoredSources(saveDir));
    selectedSources = orderedConfiguredSources.filter((source) =>
      stored.has(source),
    );
  } catch {
    selectedSources = listStoredSources(saveDir);
  }
}

const document = exportDocumentsFromDb(saveDir, {
  sources: selectedSources,
  limit,
  excludeSeen,
  excludeCompleted,
});

fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(path.resolve(outputPath));
