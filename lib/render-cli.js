#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getDefaultMaskPath } = require("./document-paths");
const { applyMask } = require("./mask");
const { renderDocument } = require("./render-html");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-render <input-json> [output-html] [--mask <mask-json> | --ids <comma-separated-item-ids>]",
  );
  process.exit(0);
}

const inputPath = process.argv[2];
let maskPath = null;
let inlineIds = null;
let outputPath = null;

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--mask") {
    maskPath = process.argv[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--ids") {
    inlineIds = process.argv[index + 1];
    index += 1;
    continue;
  }
  if (outputPath === null) {
    outputPath = arg;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (!outputPath)
  outputPath = path.resolve(inputPath).replace(/\.json$/i, ".html");

let document = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (maskPath && inlineIds) {
  throw new Error("Use either --mask or --ids, not both");
}
if (maskPath) {
  const mask = JSON.parse(fs.readFileSync(maskPath, "utf8"));
  document = applyMask(document, mask);
} else if (inlineIds) {
  document = applyMask(document, {
    item_ids: inlineIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  });
} else {
  const defaultMaskPath = getDefaultMaskPath(inputPath);
  if (fs.existsSync(defaultMaskPath)) {
    const mask = JSON.parse(fs.readFileSync(defaultMaskPath, "utf8"));
    document = applyMask(document, mask);
  }
}
const html = renderDocument(document);
fs.writeFileSync(outputPath, html, "utf8");
console.log(path.resolve(outputPath));
