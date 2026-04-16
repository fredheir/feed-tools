#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { assignCategories } = require("./allocation");
const { loadConfig, resolveCanonicalSaveDir } = require("./config");
const { getDefaultDocumentPath } = require("./document-paths");
const { loadDocument } = require("./selection");
const { loadAllocationFromDb, saveAllocationToDb } = require("./sqlite-store");
const HELP_FLAGS = new Set(["-h", "--help"]);

function requireArgValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseCategoryAssignment(spec) {
  const colonIndex = spec.indexOf(":");
  if (colonIndex <= 0) {
    throw new Error(`Invalid --category spec: ${spec}`);
  }
  return {
    category: spec.slice(0, colonIndex).trim(),
    selection: spec.slice(colonIndex + 1).trim(),
  };
}

function parseClassifyCliArgs(argv, config) {
  let inputPath = getDefaultDocumentPath();
  let explicitSaveDir = null;
  const assignments = [];

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--") && inputPath === getDefaultDocumentPath()) {
      inputPath = arg;
      continue;
    }
    if (arg === "--category") {
      assignments.push(
        parseCategoryAssignment(requireArgValue(argv, index, arg)),
      );
      index += 1;
      continue;
    }
    if (arg === "--save-dir") {
      explicitSaveDir = resolveCanonicalSaveDir(
        config,
        requireArgValue(argv, index, arg),
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    inputPath,
    explicitSaveDir,
    assignments,
  };
}

if (HELP_FLAGS.has(process.argv[2])) {
  console.log(
    "Usage: feed-classify [input-json] [--save-dir DIR] --category Label:rows [--category Label:rows]...",
  );
  process.exit(0);
}

const config = loadConfig();
const { inputPath, explicitSaveDir, assignments } = parseClassifyCliArgs(
  process.argv,
  config,
);

if (assignments.length === 0) {
  throw new Error("Use at least one --category Label:rows assignment");
}

const document = loadDocument(inputPath);
const worksetSource = document.source === "combined" ? null : document.source;
const saveDir =
  explicitSaveDir || resolveCanonicalSaveDir(config, null, worksetSource);
const allocation = loadAllocationFromDb(saveDir, document);
const nextAllocation = assignCategories(document, allocation, assignments);
saveAllocationToDb(saveDir, document, nextAllocation);
process.stdout.write(`${path.resolve(saveDir, "feed.sqlite")}\n`);
