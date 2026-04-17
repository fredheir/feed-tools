#!/usr/bin/env node
"use strict";

const {
  loadConfig,
  getCaptureDefaults,
  getCaptureBrowserOptions,
  resolveCanonicalSaveDir,
  DEFAULT_ASSETS_DIR,
} = require("./config");
const { requireArgValue } = require("./cli-args");
const { combineDocuments } = require("./document-ops");
const { hasNewUnclassifiedItems } = require("./source-capture");
const { isSupportedSource } = require("./source-catalog");
const { getCaptureHandler } = require("./source-registry");

function parseSourceNames(argv) {
  const args = argv.slice(2);
  const sourceNames = [];
  while (
    args[0] &&
    !args[0].startsWith("--") &&
    Number.isNaN(Number(args[0]))
  ) {
    sourceNames.push(args.shift());
  }
  return { sourceNames, remainingArgs: args };
}

function parseCaptureCliArgs(argv, config) {
  const { sourceNames, remainingArgs } = parseSourceNames(argv);
  if (sourceNames.length === 0) {
    throw new Error("Provide at least one source");
  }
  for (const sourceName of sourceNames) {
    if (!isSupportedSource(sourceName)) {
      throw new Error(`Unsupported source: ${sourceName}`);
    }
  }

  const defaults = getCaptureDefaults(config, sourceNames[0]);
  let limit = defaults.default_limit ?? 12;
  let assetsDir = defaults.assets_dir ?? DEFAULT_ASSETS_DIR;
  let saveDir = resolveCanonicalSaveDir(
    config,
    defaults.save_dir,
    sourceNames[0],
  );
  let browserOptions = getCaptureBrowserOptions(config, sourceNames[0]);
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
        sourceNames[0],
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

function printCategorizationHint(sourceName) {
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

(async () => {
  const documents = [];
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
    const document = await getCaptureHandler(sourceName)({
      limit,
      assetsDir: assetsDir || sourceDefaults.assets_dir || DEFAULT_ASSETS_DIR,
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
})();
