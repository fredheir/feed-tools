#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { loadConfig, getEnabledSourceNames, getSaveDir } = require("./config");
const { backfillSqliteFromCurrentJson } = require("./backfill-sqlite");

if (process.argv[2] === "-h" || process.argv[2] === "--help") {
  console.log(
    "Usage: feed-backfill-sqlite [--source NAME]... [--save-dir DIR]",
  );
  process.exit(0);
}

const config = loadConfig();
let saveDir = getSaveDir(config);
const sources = [];

for (let index = 2; index < process.argv.length; index += 1) {
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
  throw new Error(`Unknown argument: ${arg}`);
}

const selectedSources =
  sources.filter(Boolean).length > 0
    ? sources.filter(Boolean)
    : getEnabledSourceNames(config);

const result = backfillSqliteFromCurrentJson(saveDir, selectedSources);
process.stdout.write(
  `${JSON.stringify(
    {
      db_path: path.resolve(saveDir, "feed.sqlite"),
      ...result,
    },
    null,
    2,
  )}\n`,
);
