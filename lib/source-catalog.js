"use strict";

const SUPPORTED_SOURCES = Object.freeze([
  "bluesky",
  "facebook",
  "linkedin",
  "tiktok",
  "x",
]);

function listSupportedSources() {
  return [...SUPPORTED_SOURCES];
}

function isSupportedSource(sourceName) {
  return SUPPORTED_SOURCES.includes(sourceName);
}

module.exports = {
  isSupportedSource,
  listSupportedSources,
  SUPPORTED_SOURCES,
};
