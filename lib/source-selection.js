"use strict";

const { getEnabledSourceNames } = require("./config");
const { listSupportedSources } = require("./source-catalog");
const { listStoredSources } = require("./sqlite-store");

function parseCommaList(spec) {
  return String(spec || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function appendCommaList(target, spec) {
  return target.concat(parseCommaList(spec));
}

function validateExplicitSources(explicitSources, supportedSources) {
  const requested = explicitSources.filter(Boolean);
  if (requested.length === 0) return [];

  const selectedSources = requested.filter((source) =>
    supportedSources.has(source),
  );
  const invalidSources = requested.filter(
    (source) => !supportedSources.has(source),
  );

  if (selectedSources.length === 0) {
    throw new Error(
      `No supported sources in explicit selection: ${requested.join(", ")}`,
    );
  }
  if (invalidSources.length > 0) {
    throw new Error(
      `Unsupported source selection: ${invalidSources.join(", ")}`,
    );
  }

  return selectedSources;
}

function resolveSelectedSources(config, saveDir, explicitSources = []) {
  const supportedSources = new Set(listSupportedSources());
  const selectedSources = validateExplicitSources(
    explicitSources,
    supportedSources,
  );
  if (selectedSources.length > 0) return selectedSources;

  const stored = new Set(listStoredSources(saveDir));
  return getEnabledSourceNames(config).filter(
    (source) => supportedSources.has(source) && stored.has(source),
  );
}

module.exports = {
  appendCommaList,
  resolveSelectedSources,
  validateExplicitSources,
};
