#!/usr/bin/env node
// @ts-check

const path = require("node:path");
const { spawnSync } = require("node:child_process");

/**
 * @param {string} entrypoint
 */
function runTsCli(entrypoint) {
  const rootDir = path.resolve(__dirname, "..");
  const cliPath = path.resolve(rootDir, entrypoint);
  const tsxLoader = require.resolve("tsx", { paths: [rootDir] });
  const result = spawnSync(
    process.execPath,
    ["--import", tsxLoader, cliPath, ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number") {
    process.exit(result.status);
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exit(1);
}

module.exports = {
  runTsCli,
};
