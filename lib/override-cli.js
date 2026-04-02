#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, getSaveDir, getCurationPreferences } = require("./config");
const {
  exportDocumentsFromDb,
  loadAllocationFromDb,
} = require("./sqlite-store");
const {
  appendCommaList,
  resolveSelectedSources,
} = require("./source-selection");
const { buildRows } = require("./selection");

function summarizeText(value, maxLength = 140) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getItemCategory(allocation, item, fallbackCategory) {
  return allocation?.items?.[item.id]?.category || fallbackCategory;
}

function formatRow(row, allocation, fallbackCategory) {
  const item = row.item;
  const stats = item.stats || {};
  return [
    row.row,
    item.source || "",
    getItemCategory(allocation, item, fallbackCategory),
    item.id || "",
    item.author?.handle || "",
    summarizeText(item.content?.text || ""),
    `♡${stats.like ?? "0"} ⟲${stats.share ?? "0"} ▥${stats.view ?? "0"}`,
    item.url || "",
  ].join("\t");
}

function parseRegex(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) return null;
  const delimited = raw.match(/^\/(.+)\/([a-z]*)$/i);
  if (delimited) {
    return {
      label: raw,
      regex: new RegExp(delimited[1], delimited[2] || "i"),
    };
  }
  return {
    label: raw,
    regex: new RegExp(raw, "i"),
  };
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
    item.author?.handle || "",
    item.author?.display_name || "",
    item.content?.text || "",
    item.url || "",
  ].join("\n");
}

function scoreRow(row, allocation, fallbackCategory, matchers) {
  const item = row.item;
  const category = getItemCategory(allocation, item, fallbackCategory);
  const haystack = getSearchHaystack(item, category);
  let hitCount = 0;

  for (const matcher of matchers) {
    if (matcher.regex.test(haystack)) hitCount += 1;
  }

  return {
    row,
    category,
    hitCount,
    score: hitCount,
  };
}

function getItemTimestamp(item) {
  const value = item.last_seen_at || item.first_seen_at || null;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-override <output-json> [--sources name1,name2,...] [--save-dir DIR] [--matches term1,term2,...] [--page N] [--page-size N]",
  );
  process.exit(0);
}

const outputPath = process.argv[2];
const config = loadConfig();
const curation = getCurationPreferences(config);
let saveDir = getSaveDir(config);
let sources = [];
let matchers = [];
let page = 1;
let pageSize = null;

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
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
  if (arg === "--matches" || arg === "--match" || arg === "--battery") {
    matchers = matchers.concat(parsePatternList(process.argv[index + 1]));
    index += 1;
    continue;
  }
  if (arg === "--page") {
    page = Math.max(1, Number.parseInt(process.argv[index + 1] || "1", 10));
    index += 1;
    continue;
  }
  if (arg === "--page-size") {
    pageSize = Math.max(1, Number.parseInt(process.argv[index + 1] || "1", 10));
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}
const selectedSources = resolveSelectedSources(config, saveDir, sources);

const document = exportDocumentsFromDb(saveDir, {
  sources: selectedSources,
});
fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

const allocation = loadAllocationFromDb(saveDir, document);
const fallbackCategory = curation.fallback_category || "Other";
const cap = curation.target_items_per_tab || 10;
const topicalPageSize = pageSize || cap;
const topicalOffset = (page - 1) * topicalPageSize;
const rows = buildRows(document);
const lines = [];

lines.push(path.resolve(outputPath));
lines.push(
  `Configured categories: ${(curation.preferred_categories || []).join(", ")}; fallback: ${fallbackCategory}; cap per section: ${cap}.`,
);
if (matchers.length > 0) {
  lines.push(
    `Matches battery: ${matchers.map((matcher) => matcher.label).join(", ")}.`,
  );
}
lines.push(
  "Use this output to choose rows, then apply the override mask with: feed-mask <output-json> --pick ...",
);

for (const sourceName of selectedSources) {
  const sourceRows = rows
    .filter(({ item }) => item.source === sourceName)
    .slice(0, cap);
  if (sourceRows.length === 0) continue;
  lines.push("");
  lines.push(`Recent ${sourceName}:`);
  for (const row of sourceRows) {
    lines.push(formatRow(row, allocation, fallbackCategory));
  }
}

if (matchers.length > 0) {
  const scoredRows = rows
    .map((row) => scoreRow(row, allocation, fallbackCategory, matchers))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        getItemTimestamp(b.row.item) - getItemTimestamp(a.row.item) ||
        b.score - a.score ||
        a.row.row - b.row.row,
    );

  lines.push("");
  lines.push(
    `Topical hits: page ${page} size ${topicalPageSize} of ${Math.max(1, Math.ceil(scoredRows.length / topicalPageSize))} (${scoredRows.length} total, newest first).`,
  );
  const topHits = scoredRows.slice(
    topicalOffset,
    topicalOffset + topicalPageSize,
  );
  if (topHits.length === 0) {
    lines.push("(none)");
  } else {
    for (const entry of topHits) {
      lines.push(
        `${formatRow(entry.row, allocation, fallbackCategory)}\thits:${entry.hitCount}`,
      );
    }
  }

  const dominantCategories = Array.from(
    new Set(topHits.map((entry) => entry.category).filter(Boolean)),
  );
  const adjacentRows = rows
    .filter(
      (row) =>
        dominantCategories.includes(
          getItemCategory(allocation, row.item, fallbackCategory),
        ) && !topHits.some((entry) => entry.row.item.id === row.item.id),
    )
    .sort(
      (a, b) =>
        getItemTimestamp(b.item) - getItemTimestamp(a.item) || a.row - b.row,
    )
    .slice(0, topicalPageSize);

  lines.push("");
  lines.push("Adjacent candidates:");
  if (adjacentRows.length === 0) {
    lines.push("(none)");
  } else {
    for (const row of adjacentRows) {
      lines.push(formatRow(row, allocation, fallbackCategory));
    }
  }
}

process.stdout.write(`${lines.join("\n")}\n`);
