#!/usr/bin/env node
"use strict";

/**
 * CLI for Claude in Chrome (CiC) agent-orchestrated capture.
 *
 * Subcommands:
 *
 *   prep <source>
 *     Outputs JSON describing how to navigate and prepare the feed.
 *
 *   extract <source> [limit]
 *     Outputs the extraction JavaScript to stdout.  The agent runs
 *     this in the browser via the CiC javascript_tool MCP call.
 *
 *   ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]
 *     Reads a raw capture document from <json-file>, normalises,
 *     deduplicates, merges with existing state, downloads assets,
 *     and persists to sqlite.  Outputs the merged document on stdout.
 */

const fs = require("node:fs");
const {
  loadConfig,
  getCaptureDefaults,
  resolveCanonicalSaveDir,
} = require("./config");
const { getSourceConfig, listCicSources } = require("./cic/source-config");
const { getExtractionScript, isCicSupported } = require("./cic/extract");
const { ingestDocument, hasNewUnclassifiedItems } = require("./cic/ingest");

function requireArgValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function usage() {
  console.log(`Usage:
  feed-capture-cic prep <source>
  feed-capture-cic extract <source> [limit]
  feed-capture-cic ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]

Supported CiC sources: ${listCicSources().join(", ")}
`);
  process.exit(0);
}

function cmdPrep(sourceName) {
  const config = getSourceConfig(sourceName);
  if (!config) {
    console.error(`Source "${sourceName}" is not supported for CiC capture.`);
    console.error(`Supported: ${listCicSources().join(", ")}`);
    process.exit(1);
  }
  const output = {
    source: sourceName,
    url: config.url,
    urlPrefixes: config.urlPrefixes,
    readyChecks: config.readyChecks,
    scrollTopScript: config.scrollTopScript,
    scrollDownScript: config.scrollDownScript,
    itemCountExpression: config.itemCountExpression,
    blockedUrlPatterns: config.blockedUrlPatterns,
    blockedTextPatterns: config.blockedTextPatterns,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function cmdExtract(sourceName, limit) {
  if (!isCicSupported(sourceName)) {
    console.error(
      `Source "${sourceName}" is not supported for CiC extraction.`,
    );
    process.exit(1);
  }
  process.stdout.write(getExtractionScript(sourceName, limit));
  process.stdout.write("\n");
}

async function cmdIngest(sourceName, jsonFile, flags) {
  if (!getSourceConfig(sourceName)) {
    console.error(`Source "${sourceName}" is not supported for CiC capture.`);
    console.error(`Supported: ${listCicSources().join(", ")}`);
    process.exit(1);
  }
  if (!fs.existsSync(jsonFile)) {
    console.error(`File not found: ${jsonFile}`);
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse JSON input ${jsonFile}: ${error.message}`);
  }
  const appConfig = loadConfig();
  const defaults = getCaptureDefaults(appConfig, sourceName);
  const assetsDir = flags.assetsDir || defaults.assets_dir || "";
  const saveDir = resolveCanonicalSaveDir(
    appConfig,
    flags.saveDir || defaults.save_dir,
    sourceName,
  );

  const merged = await ingestDocument(raw, {
    sourceName,
    assetsDir,
    saveDir,
  });

  if (hasNewUnclassifiedItems(merged, saveDir)) {
    process.stderr.write("added 1 source requiring categorisation.\n");
    process.stderr.write(`./bin/feed-curate --sources ${sourceName}\n`);
  }

  process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
}

// -- arg parsing --

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  usage();
}

const subcommand = args[0];

if (subcommand === "prep") {
  const sourceName = args[1];
  if (!sourceName) {
    console.error("Usage: feed-capture-cic prep <source>");
    process.exit(1);
  }
  cmdPrep(sourceName);
} else if (subcommand === "extract") {
  const sourceName = args[1];
  if (!sourceName) {
    console.error("Usage: feed-capture-cic extract <source> [limit]");
    process.exit(1);
  }
  const limit = args[2] ? Number.parseInt(args[2], 10) : 12;
  if (args[2] && Number.isNaN(limit)) {
    console.error(`Invalid limit: ${args[2]}`);
    process.exit(1);
  }
  cmdExtract(sourceName, limit);
} else if (subcommand === "ingest") {
  const sourceName = args[1];
  const jsonFile = args[2];
  if (!sourceName || !jsonFile) {
    console.error(
      "Usage: feed-capture-cic ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]",
    );
    process.exit(1);
  }
  const flags = {};
  for (let i = 3; i < args.length; i += 1) {
    if (args[i] === "--assets-dir") {
      flags.assetsDir = requireArgValue(args, i, args[i]);
      i += 1;
    } else if (args[i] === "--save-dir") {
      flags.saveDir = requireArgValue(args, i, args[i]);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${args[i]}`);
    }
  }
  cmdIngest(sourceName, jsonFile, flags);
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  usage();
}
