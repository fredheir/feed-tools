#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getDefaultMaskPath } = require("./document-paths");
const {
  groupPickedRowsByCategory,
  loadAllocationForDocument,
} = require("./allocation");
const { loadConfig, getCurationPreferences } = require("./config");
const { loadDocument, resolveSelectionList } = require("./selection");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-mask <input-json> [output-mask] [--pick rows|all] [--tab Label:rows] [--summary-file FILE] [--summary TEXT] [--allocation FILE legacy override]",
  );
  process.exit(0);
}

const inputPath = process.argv[2];
let outputPath = null;
const document = loadDocument(inputPath);
const tabs = [];
let summary = null;
let allocationPath = null;
let pickSpec = null;

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--allocation") {
    allocationPath = process.argv[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--pick") {
    pickSpec = process.argv[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--tab") {
    const spec = process.argv[index + 1] || "";
    index += 1;
    const colonIndex = spec.indexOf(":");
    if (colonIndex <= 0) {
      throw new Error(`Invalid --tab spec: ${spec}`);
    }
    const label = spec.slice(0, colonIndex).trim();
    const selection = spec.slice(colonIndex + 1).trim();
    tabs.push({
      label,
      groups: [
        {
          label,
          item_ids: resolveSelectionList(document, selection),
        },
      ],
    });
    continue;
  }
  if (arg === "--summary-file") {
    const summaryPath = process.argv[index + 1];
    index += 1;
    summary = fs.readFileSync(summaryPath, "utf8").trim();
    continue;
  }
  if (arg === "--summary") {
    summary = process.argv[index + 1] || "";
    index += 1;
    continue;
  }
  if (!arg.startsWith("--") && outputPath == null) {
    outputPath = arg;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

outputPath = outputPath || getDefaultMaskPath(inputPath);
const mask = {};
if (summary) mask.summary = summary;
if (!pickSpec && tabs.length === 0) {
  pickSpec = "all";
}
if (pickSpec) {
  const config = loadConfig();
  const curation = getCurationPreferences(config);
  const allocation = loadAllocationForDocument(document, allocationPath);
  tabs.push(
    ...groupPickedRowsByCategory(document, allocation, pickSpec, {
      fallbackCategory: curation.fallback_category || "Other",
      preferredCategories: curation.preferred_categories || [],
    }),
  );
}
if (tabs.length > 0) mask.tabs = tabs;

fs.writeFileSync(outputPath, `${JSON.stringify(mask, null, 2)}\n`, "utf8");
console.log(path.resolve(outputPath));
