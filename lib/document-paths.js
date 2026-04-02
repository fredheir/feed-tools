"use strict";

const path = require("node:path");
const REPO_ROOT = path.resolve(__dirname, "..");

function getDefaultDocumentPath() {
  return path.join(REPO_ROOT, "var", "feed.json");
}

function getDefaultHtmlPath() {
  return path.join(REPO_ROOT, "var", "feed.html");
}

function getDefaultMaskPath(inputPath) {
  const resolved = path.resolve(inputPath || getDefaultDocumentPath());
  if (resolved.endsWith(".json")) {
    return `${resolved.slice(0, -".json".length)}.mask.json`;
  }
  return `${resolved}.mask.json`;
}

module.exports = {
  getDefaultDocumentPath,
  getDefaultHtmlPath,
  getDefaultMaskPath,
};
