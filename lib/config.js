"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "..", "config.json");
const DEFAULT_SAVE_DIR = "/tmp/feed-archive";

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

function getEnabledSourceNames(config) {
  return getEnabledSources(config)
    .map((source) => source?.name)
    .filter(Boolean);
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

function getCaptureBrowserOptions(config, sourceName) {
  return getCaptureDefaults(config, sourceName).browser || {};
}

function getSaveDir(config, sourceName = null) {
  if (sourceName) {
    return getCaptureDefaults(config, sourceName).save_dir || DEFAULT_SAVE_DIR;
  }

  return (
    getEnabledSources(config)[0]?.capture?.save_dir ||
    getSources(config)[0]?.capture?.save_dir ||
    DEFAULT_SAVE_DIR
  );
}

function getCurationPreferences(config) {
  return config?.user_preferences?.curation || {};
}

module.exports = {
  loadConfig,
  getEnabledSourceNames,
  getDefaultSource,
  getCaptureDefaults,
  getCaptureBrowserOptions,
  getSaveDir,
  getCurationPreferences,
  DEFAULT_SAVE_DIR,
};
