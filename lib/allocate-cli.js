#!/usr/bin/env node
"use strict";

const path = require("node:path");
const {
  assignCategories,
  getAllocationPath,
  loadAllocation,
  saveAllocation,
} = require("./allocation");
const { loadDocument } = require("./selection");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-allocate <input-json> [--allocation FILE] [--category Label:rows]",
  );
  process.exit(0);
}

const inputPath = process.argv[2];
const document = loadDocument(inputPath);
let allocationPath = null;
const assignments = [];

for (let index = 3; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--allocation") {
    allocationPath = process.argv[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--category") {
    const spec = process.argv[index + 1] || "";
    index += 1;
    const colonIndex = spec.indexOf(":");
    if (colonIndex <= 0) throw new Error(`Invalid --category spec: ${spec}`);
    assignments.push({
      category: spec.slice(0, colonIndex).trim(),
      selection: spec.slice(colonIndex + 1).trim(),
    });
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const resolvedPath = getAllocationPath(document, allocationPath);
const existing = loadAllocation(resolvedPath);
const next = assignCategories(document, existing, assignments);
saveAllocation(resolvedPath, next);
console.log(path.resolve(resolvedPath));
