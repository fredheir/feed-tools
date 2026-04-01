#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pruneDocument } = require("./document-ops");

if (process.argv[2] === "-h" || process.argv[2] === "--help") {
  console.log(
    "Usage: feed-prune <input-json> [output-json] [--in-place] [--keep ids] [--drop ids]",
  );
  process.exit(0);
}

if (process.argv.length < 3) {
  throw new Error(
    "Usage: feed-prune <input-json> [output-json] [--in-place] [--keep ids] [--drop ids]",
  );
}

const inputPath = process.argv[2];
let outputPath = null;
let inPlace = false;
let keepSpec = null;
let dropSpec = null;

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--in-place") {
    inPlace = true;
    continue;
  }
  if (arg === "--keep") {
    keepSpec = process.argv[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--drop") {
    dropSpec = process.argv[index + 1] || "";
    index += 1;
    continue;
  }
  if (!outputPath) {
    outputPath = arg;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if ((keepSpec && dropSpec) || (!keepSpec && !dropSpec)) {
  throw new Error("Use exactly one of --keep or --drop");
}
if (inPlace && outputPath) {
  throw new Error("Use either an output path or --in-place, not both");
}
if (!inPlace && !outputPath) {
  throw new Error("Provide an output path or use --in-place");
}

const document = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const pruned = pruneDocument(document, {
  keep: keepSpec,
  drop: dropSpec,
});

const targetPath = inPlace ? inputPath : outputPath;
fs.writeFileSync(targetPath, `${JSON.stringify(pruned, null, 2)}\n`, "utf8");
console.log(path.resolve(targetPath));
