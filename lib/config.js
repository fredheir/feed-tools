"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "..", "config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function getSources(config) {
  return config?.user_preferences?.sources || [];
}

function getSourcePreferences(config, sourceName) {
  return (
    getSources(config).find((source) => source.name === sourceName) || null
  );
}

function getDefaultSource(config) {
  const sources = getSources(config);
  return (
    sources.find((source) => source.default)?.name || sources[0]?.name || null
  );
}

function getCaptureDefaults(config, sourceName) {
  const source = getSourcePreferences(config, sourceName);
  return source?.capture || {};
}

module.exports = {
  loadConfig,
  getDefaultSource,
  getCaptureDefaults,
};
