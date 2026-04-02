#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  loadConfig,
  getDefaultSource,
  getCaptureDefaults,
  DEFAULT_SAVE_DIR,
} = require("./config");
const { openPathOrUrl } = require("./browser");
const { applyMask } = require("./mask");
const { renderDocument } = require("./render-html");
const { exportDocumentsFromDb } = require("./sqlite-store");
const { getCaptureHandler, isSupportedSource } = require("./source-registry");

if (process.argv[2] === "-h" || process.argv[2] === "--help") {
  console.log(
    "Usage: feed-view [source] [limit] [--assets-dir DIR] [--save-dir DIR] [--ids x:...,x:...]",
  );
  process.exit(0);
}

const config = loadConfig();
let args = process.argv.slice(2);
const sourceName =
  args[0] && !args[0].startsWith("--")
    ? args.shift()
    : getDefaultSource(config);
if (!isSupportedSource(sourceName)) {
  throw new Error(`Unsupported source: ${sourceName}`);
}

const defaults = getCaptureDefaults(config, sourceName);
let limit = defaults.default_limit ?? 12;
let assetsDir = defaults.assets_dir ?? "";
let saveDir = defaults.save_dir ?? DEFAULT_SAVE_DIR;
let ids = [];

if (args[0] && !args[0].startsWith("--")) {
  limit = Number.parseInt(args[0], 10);
  args = args.slice(1);
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--assets-dir") {
    assetsDir = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--save-dir") {
    saveDir = args[index + 1] || saveDir;
    index += 1;
    continue;
  }
  if (arg === "--ids") {
    ids = String(args[index + 1] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

(async () => {
  await getCaptureHandler(sourceName)({
    limit,
    assetsDir,
    saveDir,
  });

  let document = exportDocumentsFromDb(saveDir, {
    sources: [sourceName],
  });
  if (ids.length > 0) {
    document = applyMask(document, { item_ids: ids });
  }

  const outputPath = path.join(os.tmpdir(), `feed-view-${sourceName}.html`);
  fs.writeFileSync(outputPath, renderDocument(document), "utf8");
  openPathOrUrl(outputPath);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
