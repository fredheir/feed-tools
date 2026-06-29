#!/usr/bin/env node
import {
  loadConfig,
  getCaptureDefaults,
  getCaptureBrowserOptions,
  getAssetsDir,
  resolveCanonicalSaveDir,
} from "./config.ts";
import { hasNewUnclassifiedItems } from "./allocation.ts";
import { requireArgValue } from "./cli-args.ts";
import { combineDocuments } from "./document-ops.ts";
import { getCaptureHandler } from "../sources/registry.ts";
import { SOURCE_NAME_SET } from "./source-metadata.ts";
import type {
  FeedBrowserConfig,
  FeedConfig,
  FeedDocument,
  FeedSourceName,
} from "./types.ts";

function parseSourceNames(argv: string[]): {
  sourceNames: FeedSourceName[];
  remainingArgs: string[];
} {
  const args = argv.slice(2);
  const sourceNames: FeedSourceName[] = [];
  while (
    args[0] &&
    !args[0].startsWith("--") &&
    Number.isNaN(Number(args[0]))
  ) {
    const candidate = args.shift();
    if (candidate && SOURCE_NAME_SET.has(candidate)) {
      sourceNames.push(candidate as FeedSourceName);
    } else if (candidate) {
      throw new Error(`Unsupported source: ${candidate}`);
    }
  }
  return { sourceNames, remainingArgs: args };
}

function parseCaptureCliArgs(
  argv: string[],
  config: FeedConfig,
): {
  sourceNames: FeedSourceName[];
  limit: number;
  assetsDir: string;
  saveDir: string;
  browserOptions: FeedBrowserConfig;
} {
  const { sourceNames, remainingArgs } = parseSourceNames(argv);
  if (sourceNames.length === 0) {
    throw new Error("Provide at least one source");
  }
  const [primarySource] = sourceNames;
  if (!primarySource) {
    throw new Error("Provide at least one source");
  }

  const defaults = getCaptureDefaults(config, primarySource);
  let limit = defaults.default_limit ?? 12;
  let assetsDir = "";
  let saveDir = "";
  let browserOptions = getCaptureBrowserOptions(config, primarySource);
  let args = remainingArgs;

  if (args[0] && !args[0].startsWith("--")) {
    limit = Number.parseInt(args[0], 10);
    if (Number.isNaN(limit)) {
      throw new Error(`Invalid limit: ${args[0]}`);
    }
    args = args.slice(1);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--assets-dir") {
      assetsDir = requireArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--save-dir") {
      saveDir = resolveCanonicalSaveDir(
        config,
        requireArgValue(args, index, arg),
        primarySource,
      );
      index += 1;
      continue;
    }
    if (arg === "--session") {
      browserOptions = {
        ...browserOptions,
        session: requireArgValue(args, index, arg),
      };
      index += 1;
      continue;
    }
    if (arg === "--state") {
      browserOptions = {
        ...browserOptions,
        statePath: requireArgValue(args, index, arg),
      };
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      browserOptions = {
        ...browserOptions,
        profile: requireArgValue(args, index, arg),
      };
      index += 1;
      continue;
    }
    if (arg === "--browser-arg") {
      browserOptions = {
        ...browserOptions,
        args: [
          ...(browserOptions.args || []),
          requireArgValue(args, index, arg),
        ],
      };
      index += 1;
      continue;
    }
    if (arg === "--headed") {
      browserOptions = { ...browserOptions, headed: true };
      continue;
    }
    if (arg === "--auto-connect") {
      browserOptions = { ...browserOptions, autoConnect: true };
      continue;
    }
    if (arg === "--no-auto-connect") {
      browserOptions = { ...browserOptions, autoConnect: false };
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    sourceNames,
    limit,
    assetsDir,
    saveDir,
    browserOptions,
  };
}

function printCategorizationHint(sourceName: string): void {
  process.stderr.write("added 1 source requiring categorisation.\n");
  process.stderr.write(
    "assign this to a sub-agent (if available, this protects your context window)\n",
  );
  process.stderr.write(`./bin/feed-curate --sources ${sourceName}\n`);
}

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-capture <source>... [limit] [--assets-dir DIR] [--save-dir DIR] [--session NAME] [--state FILE] [--profile DIR] [--browser-arg ARG] [--headed] [--auto-connect|--no-auto-connect]",
  );
  process.exit(0);
}

const config = loadConfig();
const { sourceNames, limit, assetsDir, saveDir, browserOptions } =
  parseCaptureCliArgs(process.argv, config);

const documents: FeedDocument[] = [];
for (const sourceName of sourceNames) {
  const sourceDefaults = getCaptureDefaults(config, sourceName);
  const sourceSaveDir = resolveCanonicalSaveDir(
    config,
    saveDir || sourceDefaults.save_dir,
    sourceName,
  );
  const sourceBrowserOptions = {
    ...getCaptureBrowserOptions(config, sourceName),
    ...browserOptions,
  };
  const captureHandler = getCaptureHandler(sourceName);
  if (!captureHandler) {
    throw new Error(`Unsupported source: ${sourceName}`);
  }
  const document = await captureHandler({
    limit,
    assetsDir: assetsDir || getAssetsDir(config, sourceName),
    saveDir: sourceSaveDir,
    browserOptions: sourceBrowserOptions,
  });
  if (hasNewUnclassifiedItems(document, sourceSaveDir)) {
    printCategorizationHint(sourceName);
  }
  documents.push(document);
}
const document =
  documents.length === 1 ? documents[0] : combineDocuments(documents);
process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
