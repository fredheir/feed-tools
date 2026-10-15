#!/usr/bin/env node
/**
 * CLI for Claude in Chrome (CiC) agent-orchestrated capture.
 *
 * Subcommands:
 *
 *   prep <source>
 *     Outputs JSON describing how to navigate and prepare the feed.
 *
 *   extract <source> [limit] [--download [filename]]
 *     [--min-items N] [--stable-ticks N] [--timeout-ms N]
 *     Outputs the extraction JavaScript to stdout.  The agent runs
 *     this in the browser via the CiC javascript_tool MCP call.
 *     With --download, the script triggers a browser download instead
 *     of returning the JSON payload through the MCP result channel.
 *
 *   ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]
 *     Reads a raw capture document from <json-file>, normalises,
 *     deduplicates, merges with existing state, downloads assets,
 *     and persists to sqlite.  Outputs the merged document on stdout.
 */

import fs from "node:fs";
import { DEFAULT_CAPTURE_LIMIT, parseCaptureLimit } from "./capture-limit.ts";
import { requireArgValue } from "./cli-args.ts";
import {
  loadOptionalConfig,
  getCaptureDefaults,
  getAssetsDir,
  resolveCanonicalSaveDir,
} from "./config.ts";
import { getSourceConfig, listCicSources } from "./cic/source-config.ts";
import {
  buildDownloadExtractionScript,
  getExtractionScript,
} from "../sources/cic-extract.ts";
import { ingestDocument } from "./cic/ingest.ts";
import { hasNewUnclassifiedItems } from "./allocation.ts";
import { getSourceManifest } from "../sources/manifest.ts";

function usage(): never {
  console.log(`Usage:
  feed-capture-cic prep <source>
  feed-capture-cic extract <source> [limit] [--download [filename]] [--min-items N] [--stable-ticks N] [--timeout-ms N]
  feed-capture-cic ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]

Supported CiC sources: ${listCicSources().join(", ")}
`);
  process.exit(0);
}

function cmdPrep(sourceName: string): void {
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

function cmdExtract(
  sourceName: string,
  limit: number,
  flags: {
    downloadFilename?: string;
    minItems?: number;
    stableTicks?: number;
    timeoutMs?: number;
  },
): void {
  const config = getSourceConfig(sourceName);
  if (!config) {
    console.error(
      `Source "${sourceName}" is not supported for CiC extraction.`,
    );
    process.exit(1);
  }
  const script = flags.downloadFilename
    ? buildDownloadExtractionScript(sourceName, limit, flags.downloadFilename, {
        itemCountExpression: config.itemCountExpression,
        minItems: flags.minItems,
        stableTicks: flags.stableTicks,
        timeoutMs: flags.timeoutMs,
      })
    : getExtractionScript(sourceName, limit);
  process.stdout.write(script);
  process.stdout.write("\n");
}

function parsePositiveInteger(value: string, name: string): number {
  try {
    return parseCaptureLimit(value, name);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : `Invalid ${name}: ${value}`,
    );
    process.exit(1);
  }
}

async function cmdIngest(
  sourceName: string,
  jsonFile: string,
  flags: { assetsDir?: string; saveDir?: string },
): Promise<void> {
  if (!getSourceConfig(sourceName)) {
    console.error(`Source "${sourceName}" is not supported for CiC capture.`);
    console.error(`Supported: ${listCicSources().join(", ")}`);
    process.exit(1);
  }
  if (!fs.existsSync(jsonFile)) {
    console.error(`File not found: ${jsonFile}`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    throw new Error(
      `Failed to parse JSON input ${jsonFile}: ${error.message}`,
      {
        cause: error,
      },
    );
  }
  const appConfig = loadOptionalConfig();
  const defaults = appConfig ? getCaptureDefaults(appConfig, sourceName) : null;
  const assetsDir =
    flags.assetsDir || (appConfig ? getAssetsDir(appConfig, sourceName) : "");
  const saveDir = appConfig
    ? resolveCanonicalSaveDir(
        appConfig,
        flags.saveDir || defaults?.save_dir,
        sourceName,
      )
    : flags.saveDir || "";

  const merged = await ingestDocument(raw, {
    sourceName,
    assetsDir,
    saveDir,
    preNormalize: getSourceManifest(sourceName)?.cic.preNormalize,
  });

  if (hasNewUnclassifiedItems(merged, saveDir)) {
    process.stderr.write("added 1 source requiring categorisation.\n");
    process.stderr.write(`./bin/feed-curate --sources ${sourceName}\n`);
  }

  process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
}

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
    console.error(
      "Usage: feed-capture-cic extract <source> [limit] [--download [filename]]",
    );
    process.exit(1);
  }
  let limit = DEFAULT_CAPTURE_LIMIT;
  let limitWasSet = false;
  const flags: {
    downloadFilename?: string;
    minItems?: number;
    stableTicks?: number;
    timeoutMs?: number;
  } = {};
  for (let i = 2; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--download") {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags.downloadFilename = next;
        i += 1;
      } else {
        flags.downloadFilename = `cic-capture-${sourceName}.json`;
      }
      continue;
    }
    if (
      arg === "--min-items" ||
      arg === "--stable-ticks" ||
      arg === "--timeout-ms"
    ) {
      const value = requireArgValue(args, i, arg);
      const parsed = parsePositiveInteger(value, arg);
      if (arg === "--min-items") flags.minItems = parsed;
      if (arg === "--stable-ticks") flags.stableTicks = parsed;
      if (arg === "--timeout-ms") flags.timeoutMs = parsed;
      i += 1;
      continue;
    }
    if (!arg.startsWith("--") && !limitWasSet) {
      limit = parsePositiveInteger(arg, "limit");
      limitWasSet = true;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
  cmdExtract(sourceName, limit, flags);
} else if (subcommand === "ingest") {
  const sourceName = args[1];
  const jsonFile = args[2];
  if (!sourceName || !jsonFile) {
    console.error(
      "Usage: feed-capture-cic ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]",
    );
    process.exit(1);
  }
  const flags: { assetsDir?: string; saveDir?: string } = {};
  for (let i = 3; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === "--assets-dir") {
      flags.assetsDir = requireArgValue(args, i, flag);
      i += 1;
    } else if (flag === "--save-dir") {
      flags.saveDir = requireArgValue(args, i, flag);
      i += 1;
    } else {
      console.error(`Unknown argument: ${flag}`);
      process.exit(1);
    }
  }
  await cmdIngest(sourceName, jsonFile, flags);
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  usage();
}
