"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SAVE_DIR = path.join(REPO_ROOT, "var", "feed-archive");
const LEGACY_SAVE_DIR = path.join(REPO_ROOT, "var");

function getConfigPath() {
  const override = process.env.FEED_TOOLS_CONFIG;
  return override
    ? path.resolve(override)
    : path.resolve(__dirname, "..", "config.json");
}

function resolveSaveDir(value) {
  const candidate = String(value || "").trim();
  return candidate ? path.resolve(REPO_ROOT, candidate) : "";
}

function resolveCanonicalSaveDir(
  config,
  requestedSaveDir = null,
  sourceName = null,
) {
  const normalizedRequested = resolveSaveDir(requestedSaveDir);

  if (normalizedRequested && normalizedRequested === LEGACY_SAVE_DIR) {
    return getSaveDir(config, sourceName);
  }

  return normalizedRequested || getSaveDir(config, sourceName);
}

function loadConfig() {
  const configPath = getConfigPath();
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing config: ${configPath}`);
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
    return resolveSaveDir(
      getCaptureDefaults(config, sourceName).save_dir || DEFAULT_SAVE_DIR,
    );
  }

  return resolveSaveDir(
    getEnabledSources(config)[0]?.capture?.save_dir ||
      getSources(config)[0]?.capture?.save_dir ||
      DEFAULT_SAVE_DIR,
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
  resolveCanonicalSaveDir,
  getSaveDir,
  getCurationPreferences,
  DEFAULT_SAVE_DIR,
};
