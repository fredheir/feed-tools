#!/usr/bin/env node
// @ts-check

const path = require("node:path");

// tsx/cjs has no type declarations; registering the loader lets require() resolve .ts files.
// @ts-expect-error - tsx/cjs registers a loader side-effect; no exported types.
require("tsx/cjs");

let exitingForError = false;

/**
 * @param {unknown} error
 */
function printCliError(error) {
  if (exitingForError) return;
  exitingForError = true;
  const message = error instanceof Error ? error.message : String(error);
  if (process.env.DEBUG && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exitCode = 1;
}

process.on("uncaughtException", printCliError);
process.on("unhandledRejection", printCliError);

/**
 * @param {string} entrypoint
 */
function runTsCli(entrypoint) {
  const rootDir = path.resolve(__dirname, "..");
  try {
    return require(path.resolve(rootDir, entrypoint));
  } catch (error) {
    printCliError(error);
    return null;
  }
}

module.exports = {
  runTsCli,
};
