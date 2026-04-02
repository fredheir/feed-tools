#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { assignCategories } = require("./allocation");
const { getDefaultDocumentPath } = require("./document-paths");
const { loadDocument } = require("./selection");
const { loadAllocationFromDb, saveAllocationToDb } = require("./sqlite-store");
const HELP_FLAGS = new Set(["-h", "--help"]);

if (HELP_FLAGS.has(process.argv[2])) {
  console.log(
    "Usage: feed-classify [input-json] --category Label:rows [--category Label:rows]...",
  );
  process.exit(0);
}

let inputPath = getDefaultDocumentPath();
let explicitSaveDir = null;
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
    const category = spec.slice(0, colonIndex).trim();
    const selection = spec.slice(colonIndex + 1).trim();
    assignments.push({
      category,
      selection,
    });
    continue;
  }
  if (arg === "--save-dir") {
    explicitSaveDir = process.argv[index + 1] || null;
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (assignments.length === 0) {
  throw new Error("Use at least one --category Label:rows assignment");
}

const document = loadDocument(inputPath);
const saveDir = explicitSaveDir || path.dirname(path.resolve(inputPath));
const allocation = loadAllocationFromDb(saveDir, document);
const nextAllocation = assignCategories(document, allocation, assignments);
saveAllocationToDb(saveDir, document, nextAllocation);
process.stdout.write(`${path.resolve(saveDir, "feed.sqlite")}\n`);
