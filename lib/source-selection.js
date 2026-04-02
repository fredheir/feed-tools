"use strict";

const { getEnabledSourceNames } = require("./config");
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

function resolveSelectedSources(config, saveDir, explicitSources = []) {
  const selectedSources = explicitSources.filter(Boolean);
  if (selectedSources.length > 0) return selectedSources;

  const stored = new Set(listStoredSources(saveDir));
  return getEnabledSourceNames(config).filter((source) => stored.has(source));
}

module.exports = {
  appendCommaList,
  resolveSelectedSources,
};
