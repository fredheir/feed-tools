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
 *     Outputs the extraction JavaScript to stdout.  The agent runs
 *     this in the browser via the CiC javascript_tool MCP call.
 *     With --download, the script triggers a browser download instead
 *     of returning the JSON payload through the MCP result channel.
 *
 *   configure-downloads [download-dir] [--profile DIR]
 *     Creates the download directory and writes Chrome profile
 *     preferences so downloads land in the workspace without prompting.
 *
 *   ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]
 *     Reads a raw capture document from <json-file>, normalises,
 *     deduplicates, merges with existing state, downloads assets,
 *     and persists to sqlite.  Outputs the merged document on stdout.
 */

import fs from "node:fs";
import path from "node:path";
import { requireArgValue } from "./cli-args.ts";
import {
  loadOptionalConfig,
  getCaptureDefaults,
  resolveCanonicalSaveDir,
} from "./config.ts";
import { getSourceConfig, listCicSources } from "./cic/source-config.ts";
import {
  buildDownloadExtractionScript,
  getExtractionScript,
  isCicSupported,
} from "./cic/extract.ts";
import { ingestDocument } from "./cic/ingest.ts";
import { hasNewUnclassifiedItems } from "./source-capture.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_CHROME_PROFILE = path.join(REPO_ROOT, "chrome-profile");
const DEFAULT_CIC_DOWNLOAD_DIR = path.join(REPO_ROOT, "var", "cic-downloads");

function usage(): never {
  console.log(`Usage:
  feed-capture-cic prep <source>
  feed-capture-cic extract <source> [limit] [--download [filename]]
  feed-capture-cic configure-downloads [download-dir] [--profile DIR]
  feed-capture-cic ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]

Supported CiC sources: ${listCicSources().join(", ")}
`);
  process.exit(0);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }
  return value as Record<string, unknown>;
}

function writeJsonObject(
  filePath: string,
  value: Record<string, unknown>,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function setNestedObject(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const existing = target[key];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }
  const created: Record<string, unknown> = {};
  target[key] = created;
  return created;
}

function configureChromeDownloads({
  profileDir,
  downloadDir,
}: {
  profileDir: string;
  downloadDir: string;
}): { profileDir: string; downloadDir: string; preferencesPath: string } {
  const resolvedProfileDir = path.resolve(profileDir);
  const resolvedDownloadDir = path.resolve(downloadDir);
  const preferencesPath = path.join(
    resolvedProfileDir,
    "Default",
    "Preferences",
  );
  fs.mkdirSync(resolvedDownloadDir, { recursive: true });

  const preferences = readJsonObject(preferencesPath);
  const downloadPrefs = setNestedObject(preferences, "download");
  downloadPrefs.default_directory = resolvedDownloadDir;
  downloadPrefs.directory_upgrade = true;
  downloadPrefs.prompt_for_download = false;

  const saveFilePrefs = setNestedObject(preferences, "savefile");
  saveFilePrefs.default_directory = resolvedDownloadDir;

  writeJsonObject(preferencesPath, preferences);
  return {
    profileDir: resolvedProfileDir,
    downloadDir: resolvedDownloadDir,
    preferencesPath,
  };
}

function cmdConfigureDownloads(args: string[]): void {
  let downloadDir = DEFAULT_CIC_DOWNLOAD_DIR;
  let profileDir = DEFAULT_CHROME_PROFILE;
  let downloadDirWasSet = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--profile") {
      profileDir = requireArgValue(args, i, arg);
      i += 1;
      continue;
    }
    if (!arg.startsWith("--") && !downloadDirWasSet) {
      downloadDir = arg;
      downloadDirWasSet = true;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  const result = configureChromeDownloads({ profileDir, downloadDir });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  flags: { downloadFilename?: string },
): void {
  if (!isCicSupported(sourceName)) {
    console.error(
      `Source "${sourceName}" is not supported for CiC extraction.`,
    );
    process.exit(1);
  }
  const script = flags.downloadFilename
    ? buildDownloadExtractionScript(sourceName, limit, flags.downloadFilename)
    : getExtractionScript(sourceName, limit);
  process.stdout.write(script);
  process.stdout.write("\n");
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON input ${jsonFile}: ${message}`);
  }
  const appConfig = loadOptionalConfig();
  const defaults = appConfig ? getCaptureDefaults(appConfig, sourceName) : null;
  const assetsDir = flags.assetsDir || defaults?.assets_dir || "";
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
  let limit = 12;
  let limitWasSet = false;
  const flags: { downloadFilename?: string } = {};
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
    if (!arg.startsWith("--") && !limitWasSet) {
      const parsedLimit = Number.parseInt(arg, 10);
      if (Number.isNaN(parsedLimit)) {
        console.error(`Invalid limit: ${arg}`);
        process.exit(1);
      }
      limit = parsedLimit;
      limitWasSet = true;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
  cmdExtract(sourceName, limit, flags);
} else if (subcommand === "configure-downloads") {
  cmdConfigureDownloads(args.slice(1));
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
