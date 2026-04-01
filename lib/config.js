"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "..", "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing config: ${CONFIG_PATH}`);
    }
    throw error;
  }
}

function getSources(config) {
  return config?.user_preferences?.sources || [];
}

function getEnabledSources(config) {
  return getSources(config).filter((source) => source?.enabled !== false);
}

function getSourcePreferences(config, sourceName) {
  return (
    getSources(config).find((source) => source.name === sourceName) || null
  );
}

function getDefaultSource(config) {
  const sources = getEnabledSources(config);
  return (
    sources.find((source) => source.default)?.name || sources[0]?.name || null
  );
}

function getCaptureDefaults(config, sourceName) {
  const source = getSourcePreferences(config, sourceName);
  return source?.capture || {};
}

function getCurationPreferences(config) {
  return config?.user_preferences?.curation || {};
}

module.exports = {
  loadConfig,
  getSources,
  getEnabledSources,
  getDefaultSource,
  getCaptureDefaults,
  getCurationPreferences,
};
