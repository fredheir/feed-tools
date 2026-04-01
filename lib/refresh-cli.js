#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  loadConfig,
  getDefaultSource,
  getCaptureDefaults,
} = require("./config");
const { applyMask } = require("./mask");
const { renderDocument } = require("./render-html");
const { getCaptureHandler, isSupportedSource } = require("./source-registry");

if (process.argv[2] === "-h" || process.argv[2] === "--help") {
  console.log("Usage: feed-refresh [source] --mask <mask-json> <output-html>");
  process.exit(0);
}

const config = loadConfig();
let args = process.argv.slice(2);
let sourceName =
  args[0] && !args[0].startsWith("--")
    ? args.shift()
    : getDefaultSource(config);
let maskPath = null;
let outputPath = null;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--mask") {
    maskPath = args[index + 1];
    index += 1;
    continue;
  }
  if (!outputPath) {
    outputPath = arg;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (!sourceName || !isSupportedSource(sourceName))
  throw new Error(`Unsupported source: ${sourceName}`);
if (!maskPath || !outputPath)
  throw new Error(
    "Usage: feed-refresh [source] --mask <mask-json> <output-html>",
  );

(async () => {
  const defaults = getCaptureDefaults(config, sourceName);
  let document = await getCaptureHandler(sourceName)({
    limit: defaults.default_limit ?? 12,
    assetsDir: defaults.assets_dir ?? "",
    saveDir: defaults.save_dir ?? "/tmp/feed-archive",
  });
  const mask = JSON.parse(fs.readFileSync(maskPath, "utf8"));
  document = applyMask(document, mask);
  fs.writeFileSync(outputPath, renderDocument(document), "utf8");
  console.log(path.resolve(outputPath));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
