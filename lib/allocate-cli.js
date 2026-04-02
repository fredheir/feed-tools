#!/usr/bin/env node
"use strict";

const {
  assignCategories,
  loadAllocationForDocument,
  saveAllocationForDocument,
} = require("./allocation");
const { loadDocument } = require("./selection");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-allocate <input-json> [--category Label:rows] [--allocation FILE legacy override]",
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

const existing = loadAllocationForDocument(document, allocationPath);
const next = assignCategories(document, existing, assignments);
const resolvedPath = saveAllocationForDocument(document, next, allocationPath);
console.log(resolvedPath);
