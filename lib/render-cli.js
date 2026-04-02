#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  getDefaultDocumentPath,
  getDefaultHtmlPath,
} = require("./document-paths");
const {
  groupPickedRowsByCategory,
  loadAllocationFromDocument,
} = require("./allocation");
const { loadConfig, getCurationPreferences } = require("./config");
const { createBrowserSession } = require("./browser");
const { applyMask } = require("./mask");
const { renderDocument } = require("./render/html");
const { resolveSelectionList } = require("./selection");
const REPO_ROOT = path.resolve(__dirname, "..");

function relativizeAssetPaths(document, outputPath) {
  const toRelative = (value) =>
    !value || /^(https?:|data:|file:)/i.test(value)
      ? value
      : path
          .relative(
            path.dirname(outputPath),
            path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value),
          )
          .split(path.sep)
          .join("/");

  for (const item of document.items || []) {
    if (item.author)
      item.author.profile_image_local = toRelative(
        item.author.profile_image_local,
      );
    for (const media of item.media || [])
      media.local_src = toRelative(media.local_src);
    for (const card of item.cards || [])
      card.image_local = toRelative(card.image_local);
  }
}

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 2
) {
  console.log(
    "Usage: feed-render [input-json] [output-html] [--pick rows|all|rows,all] [--tab] [--summary-file FILE] [--summary TEXT] [--no-open]",
  );
  console.log(
    "  --pick order controls render order. Append ',all' to pin specific rows first and keep the remaining rows in natural row order.",
  );
  process.exit(0);
}

let inputPath = getDefaultDocumentPath();
let outputPath = null;
let pickSpec = null;
let summary = null;
let noOpen = false;
let tabbed = false;

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--") && inputPath === getDefaultDocumentPath()) {
    inputPath = arg;
    continue;
  }
  if (arg === "--pick") {
    pickSpec = process.argv[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--tab") {
    tabbed = true;
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
  if (arg === "--no-open") {
    noOpen = true;
    continue;
  }
  if (outputPath === null) {
    outputPath = arg;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (!outputPath)
  outputPath =
    inputPath === getDefaultDocumentPath()
      ? getDefaultHtmlPath()
      : path.resolve(inputPath).replace(/\.json$/i, ".html");

let document = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const config = loadConfig();
const curation = getCurationPreferences(config);
const allocation = loadAllocationFromDocument(document);
const selection = pickSpec ? resolveSelectionList(document, pickSpec) : "all";
document = applyMask(document, {
  ...(summary ? { summary } : {}),
  tabs: groupPickedRowsByCategory(document, allocation, selection, {
    fallbackCategory: curation.fallback_category || "Other",
    preferredCategories: curation.preferred_categories || [],
  }),
  tabbed,
});
relativizeAssetPaths(document, outputPath);
const html = renderDocument(document);
fs.writeFileSync(outputPath, html, "utf8");
if (!noOpen) {
  const browser = createBrowserSession();
  browser.openPathOrUrl(outputPath);
}
console.log(path.resolve(outputPath));
