#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const { loadAllocationForDocument } = require("./allocation");
const { loadConfig, getSaveDir, getCurationPreferences } = require("./config");
const { getDefaultDocumentPath } = require("./document-paths");
const {
  exportDocumentsFromDb,
  loadAllocationFromDb,
} = require("./sqlite-store");
const {
  appendCommaList,
  resolveSelectedSources,
} = require("./source-selection");
const {
  buildClassificationPrompt,
  buildRows,
  printClassificationRows,
  printRows,
  printRowsWithAllocation,
} = require("./selection");

function summarizeText(value, maxLength = 110) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function parseRegex(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) return null;
  const delimited = raw.match(/^\/(.+)\/([a-z]*)$/i);
  if (delimited) {
    return new RegExp(delimited[1], delimited[2] || "i");
  }
  return new RegExp(raw, "i");
}

function parsePatternList(spec) {
  return String(spec || "")
    .split(",")
    .map((value) => parseRegex(value))
    .filter(Boolean);
}

function getSearchHaystack(item, category) {
  return [
    item.source || "",
    category || "",
    item.id || "",
    item.author?.handle || "",
    item.author?.display_name || "",
    item.content?.text || "",
    item.url || "",
  ].join("\n");
}

function printMatchedRows(document, allocation, matchers, options = {}) {
  const { limit, fallbackCategory = "Other" } = options;
  let rows = buildRows(document)
    .map(({ row, item }) => {
      const category = allocation?.items?.[item.id]?.category || fallbackCategory;
      const haystack = getSearchHaystack(item, category);
      const hits = matchers.reduce(
        (count, regex) => (regex.test(haystack) ? count + 1 : count),
        0,
      );
      return { row, item, category, hits };
    })
    .filter((entry) => entry.hits > 0);
  if (Number.isInteger(limit) && limit > 0) {
    rows = rows.slice(0, limit);
  }
  return rows
    .map(({ row, item, category, hits }) => {
      const stats = item.stats || {};
      return [
        row,
        item.id || "",
        category,
        item.author?.handle || "",
        summarizeText(item.content?.text || "", 140),
        `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
        item.url || "",
        `hits:${hits}`,
      ].join("\t");
    })
    .join("\n");
}

function filterDocumentByMatchers(document, allocation, matchers, options = {}) {
  const { fallbackCategory = "Other" } = options;
  if (!matchers.length) return document;
  const items = buildRows(document)
    .map(({ item }) => {
      const category = allocation?.items?.[item.id]?.category || fallbackCategory;
      const haystack = getSearchHaystack(item, category);
      const hits = matchers.reduce(
        (count, regex) => (regex.test(haystack) ? count + 1 : count),
        0,
      );
      return { item, hits };
    })
    .filter((entry) => entry.hits > 0)
    .map((entry) => entry.item);
  return {
    ...document,
    items,
  };
}

function printRenderContext(config) {
  const render = config?.user_preferences?.render || {};
  const curation = config?.user_preferences?.curation || {};
  const summary = config?.user_preferences?.summary || {};
  const lines = [
    "Render context:",
    `show_summary=${render.show_summary !== false}`,
    `show_tabs=${render.show_tabs === true}`,
    `preferred_categories=${(curation.preferred_categories || []).join(",")}`,
    `target_items_per_tab=${curation.target_items_per_tab || ""}`,
    `fallback_category=${curation.fallback_category || "Other"}`,
    `relevance_policy=${curation.relevance_policy || ""}`,
    `summary_style=${summary.default_style || ""}`,
    `summary_on_request_only=${summary.populate_on_request_only !== false}`,
    `summary_instructions=${summary.custom_instructions || ""}`,
  ];
  return lines.join("\n");
}

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 2
) {
  console.log(
    "Usage: feed-curate [output-json] [--sources name1,name2,...] [--save-dir DIR] [--limit N] [--exclude-seen] [--exclude-completed] [--matches term1,term2,...]",
  );
  process.exit(0);
}

const config = loadConfig();
let outputPath = getDefaultDocumentPath();
let saveDir = getSaveDir(config);
let limit = null;
let excludeSeen = false;
let excludeCompleted = false;
let sources = [];
let matchers = [];

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--") && outputPath === getDefaultDocumentPath()) {
    outputPath = arg;
    continue;
  }
  if (arg === "--sources" || arg === "--source") {
    sources = appendCommaList(sources, process.argv[index + 1]);
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
  if (arg === "--matches" || arg === "--match") {
    matchers = matchers.concat(parsePatternList(process.argv[index + 1]));
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}
const selectedSources = resolveSelectedSources(config, saveDir, sources);

const document = exportDocumentsFromDb(saveDir, {
  sources: selectedSources,
  limit,
  excludeSeen,
  excludeCompleted,
});
const allocation = loadAllocationFromDb(saveDir, document);
const curation = getCurationPreferences(config);
const resultDocument = filterDocumentByMatchers(document, allocation, matchers, {
  fallbackCategory: curation.fallback_category || "Other",
});
fs.writeFileSync(outputPath, `${JSON.stringify(resultDocument, null, 2)}\n`, "utf8");

const resultAllocation = loadAllocationForDocument(resultDocument);
const classificationListing = printClassificationRows(
  resultDocument,
  resultAllocation,
  { limit },
);
const hasUnclassified = Boolean(classificationListing);

if (hasUnclassified) {
  process.stdout.write(`${path.resolve(outputPath)}\n`);
  process.stdout.write(`${printRenderContext(config)}\n`);
  process.stdout.write(`${buildClassificationPrompt(curation)}\n`);
  process.stdout.write(`${classificationListing}\n`);
  process.exit(2);
}

const listing =
  matchers.length > 0
    ? printMatchedRows(resultDocument, resultAllocation, matchers, {
        limit,
        fallbackCategory: curation.fallback_category || "Other",
      })
    : resultAllocation
      ? printRowsWithAllocation(resultDocument, resultAllocation, {
          limit,
          fallbackCategory: curation.fallback_category || "Other",
        })
      : printRows(resultDocument, { limit });

process.stdout.write(`${path.resolve(outputPath)}\n`);
process.stdout.write(`${printRenderContext(config)}\n`);
if (listing) process.stdout.write(`${listing}\n`);
