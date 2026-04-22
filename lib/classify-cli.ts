#!/usr/bin/env node

import * as path from "node:path";

import { requireArgValue } from "./cli-args.js";
import { loadConfig, resolveCanonicalSaveDir } from "./config.js";
import { getDefaultDocumentPath } from "./document-paths.js";
import { loadDocument } from "./selection.js";
import type { CategoryAssignment, FeedConfig } from "./types.js";

const { assignCategories } = require("./allocation.js");
const {
  loadAllocationFromDb,
  saveAllocationToDb,
} = require("./sqlite-store.js");

const HELP_FLAGS = new Set(["-h", "--help"]);

function parseCategoryAssignment(spec: string): CategoryAssignment {
  const colonIndex = spec.indexOf(":");
  if (colonIndex <= 0) {
    throw new Error(`Invalid --category spec: ${spec}`);
  }
  return {
    category: spec.slice(0, colonIndex).trim(),
    selection: spec.slice(colonIndex + 1).trim(),
  };
}

function parseClassifyCliArgs(
  argv: string[],
  config: FeedConfig,
): {
  inputPath: string;
  explicitSaveDir: string | null;
  assignments: CategoryAssignment[];
} {
  let inputPath = getDefaultDocumentPath();
  let explicitSaveDir = null;
  const assignments: CategoryAssignment[] = [];

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
