#!/usr/bin/env node
// @ts-check

const path = require("node:path");

// tsx/cjs has no type declarations; registering the loader lets require() resolve .ts files.
// @ts-expect-error - tsx/cjs registers a loader side-effect; no exported types.
require("tsx/cjs");

/**
 * @param {string} entrypoint
 */
function runTsCli(entrypoint) {
  const rootDir = path.resolve(__dirname, "..");
  require(path.resolve(rootDir, entrypoint));
}

module.exports = {
  runTsCli,
};
