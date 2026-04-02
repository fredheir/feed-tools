"use strict";

const path = require("node:path");

function getDefaultMaskPath(inputPath) {
  const resolved = path.resolve(inputPath);
  if (resolved.endsWith(".json")) {
    return `${resolved.slice(0, -".json".length)}.mask.json`;
  }
  return `${resolved}.mask.json`;
}

module.exports = {
  getDefaultMaskPath,
};
