#!/usr/bin/env node
"use strict";

const {
  assignCategories,
  loadAllocationForDocument,
  saveAllocationForDocument,
} = require("./allocation");
const { getDefaultDocumentPath } = require("./document-paths");
const { loadDocument } = require("./selection");

if (process.argv[2] === "-h" || process.argv[2] === "--help") {
  console.log(
    "Usage: feed-classify [input-json] --category Label:rows [--category Label:rows]...",
  );
  process.exit(0);
}

let inputPath = getDefaultDocumentPath();
const assignments = [];

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--") && inputPath === getDefaultDocumentPath()) {
    inputPath = arg;
    continue;
  }
  if (arg === "--category") {
    const spec = process.argv[index + 1] || "";
    index += 1;
    const colonIndex = spec.indexOf(":");
    if (colonIndex <= 0) {
      throw new Error(`Invalid --category spec: ${spec}`);
    }
    assignments.push({
      category: spec.slice(0, colonIndex).trim(),
      selection: spec.slice(colonIndex + 1).trim(),
    });
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (assignments.length === 0) {
  throw new Error("Use at least one --category Label:rows assignment");
}

const document = loadDocument(inputPath);
const allocation = loadAllocationForDocument(document);
const nextAllocation = assignCategories(document, allocation, assignments);
process.stdout.write(`${saveAllocationForDocument(document, nextAllocation)}\n`);
