#!/usr/bin/env node
"use strict";

const { loadAllocationFromDb } = require("./sqlite-store");
const {
  loadConfig,
  getCaptureDefaults,
  getCaptureBrowserOptions,
  DEFAULT_SAVE_DIR,
} = require("./config");
const { combineDocuments } = require("./document-ops");
const { getCaptureHandler, isSupportedSource } = require("./source-registry");

function hasNewUnclassifiedItems(document, saveDir) {
  const allocation = loadAllocationFromDb(saveDir, document);
  return (document.items || []).some(
    (item) =>
      item.capture_count === 1 &&
      item.last_seen_at === document.captured_at &&
      !allocation?.items?.[item.id]?.category,
  );
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

let args = process.argv.slice(2);
const sourceNames = [];
while (args[0] && !args[0].startsWith("--") && Number.isNaN(Number(args[0]))) {
  sourceNames.push(args.shift());
}

if (sourceNames.length === 0) {
  throw new Error("Provide at least one source");
}
for (const sourceName of sourceNames) {
  if (!isSupportedSource(sourceName)) {
    throw new Error(`Unsupported source: ${sourceName}`);
  }
}

const config = loadConfig();
const defaults = getCaptureDefaults(config, sourceNames[0]);
let limit = defaults.default_limit ?? 12;
let assetsDir = defaults.assets_dir ?? "";
let saveDir = defaults.save_dir ?? DEFAULT_SAVE_DIR;
let browserOptions = getCaptureBrowserOptions(config, sourceNames[0]);

if (args[0] && !args[0].startsWith("--")) {
  limit = Number.parseInt(args[0], 10);
  args = args.slice(1);
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--assets-dir") {
    assetsDir = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--save-dir") {
    saveDir = args[index + 1] || "";
    index += 1;
    continue;
  }
  if (arg === "--session") {
    browserOptions = { ...browserOptions, session: args[index + 1] || null };
    index += 1;
    continue;
  }
  if (arg === "--state") {
    browserOptions = { ...browserOptions, statePath: args[index + 1] || null };
    index += 1;
    continue;
  }
  if (arg === "--profile") {
    browserOptions = { ...browserOptions, profile: args[index + 1] || null };
    index += 1;
    continue;
  }
  if (arg === "--browser-arg") {
    browserOptions = {
      ...browserOptions,
      args: [...(browserOptions.args || []), args[index + 1] || ""].filter(
        Boolean,
      ),
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

(async () => {
  const documents = [];
  for (const sourceName of sourceNames) {
    const sourceDefaults = getCaptureDefaults(config, sourceName);
    const sourceSaveDir =
      saveDir || sourceDefaults.save_dir || DEFAULT_SAVE_DIR;
    const sourceBrowserOptions = {
      ...getCaptureBrowserOptions(config, sourceName),
      ...browserOptions,
    };
    const document = await getCaptureHandler(sourceName)({
      limit,
      assetsDir: assetsDir || sourceDefaults.assets_dir || "",
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
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
