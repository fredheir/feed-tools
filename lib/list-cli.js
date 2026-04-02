#!/usr/bin/env node
"use strict";

const { loadAllocationForDocument } = require("./allocation");
const { loadConfig, getCurationPreferences } = require("./config");
const {
  buildClassificationPrompt,
  printClassificationRows,
  loadDocument,
  printRows,
  printRowsWithAllocation,
} = require("./selection");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-list <input-json> [limit] [--unclassified] [--allocation FILE legacy override]",
  );
  process.exit(0);
}

const inputPath = process.argv[2];
const document = loadDocument(inputPath);
const config = loadConfig();
const curation = getCurationPreferences(config);
let limit = null;
let allocationPath = null;
let unclassifiedOnly = false;

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--allocation") {
    allocationPath = process.argv[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--unclassified") {
    unclassifiedOnly = true;
    continue;
  }
  if (limit == null && /^\d+$/.test(arg)) {
    limit = Number.parseInt(arg, 10);
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const allocation =
  allocationPath || unclassifiedOnly
    ? loadAllocationForDocument(document, allocationPath)
    : null;
const output = unclassifiedOnly
  ? printClassificationRows(document, allocation, { limit })
  : allocation
    ? printRowsWithAllocation(document, allocation, {
        limit,
        unclassifiedOnly,
        fallbackCategory: curation.fallback_category || "Other",
      })
    : printRows(document, { limit });
if (unclassifiedOnly && output) {
  process.stdout.write(`${buildClassificationPrompt(curation)}\n`);
}
process.stdout.write(output ? `${output}\n` : "");
