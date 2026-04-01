#!/usr/bin/env node
"use strict";

const { loadConfig, getCaptureDefaults } = require("./config");
const { captureX } = require("../sources/x/capture");

const CAPTURE_HANDLERS = { x: captureX };

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length < 3
) {
  console.log(
    "Usage: feed-capture <source> [limit] [--assets-dir DIR] [--save-dir DIR]",
  );
  process.exit(0);
}

const sourceName = process.argv[2];
if (!CAPTURE_HANDLERS[sourceName])
  throw new Error(`Unsupported source: ${sourceName}`);

const config = loadConfig();
const defaults = getCaptureDefaults(config, sourceName);
let limit = defaults.default_limit ?? 12;
let assetsDir = defaults.assets_dir ?? "";
let saveDir = defaults.save_dir ?? "/tmp/feed-archive";

let args = process.argv.slice(3);
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
  throw new Error(`Unknown argument: ${arg}`);
}

(async () => {
  const document = await CAPTURE_HANDLERS[sourceName]({
    limit,
    assetsDir,
    saveDir,
  });
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
