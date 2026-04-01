#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { combineDocuments } = require("./document-ops");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 4
) {
  console.log("Usage: feed-combine <output-json> <input-json>...");
  process.exit(0);
}

const outputPath = process.argv[2];
const inputPaths = process.argv.slice(3);

const documents = inputPaths.map((inputPath) =>
  JSON.parse(fs.readFileSync(inputPath, "utf8")),
);
const combined = combineDocuments(documents);

fs.writeFileSync(outputPath, `${JSON.stringify(combined, null, 2)}\n`, "utf8");
console.log(path.resolve(outputPath));
