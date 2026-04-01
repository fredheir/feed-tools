"use strict";

const { captureLinkedIn } = require("../sources/linkedin/capture");
const { captureX } = require("../sources/x/capture");

const CAPTURE_HANDLERS = {
  linkedin: captureLinkedIn,
  x: captureX,
};

function getCaptureHandler(sourceName) {
  return CAPTURE_HANDLERS[sourceName] || null;
}

function isSupportedSource(sourceName) {
  return Boolean(getCaptureHandler(sourceName));
}

module.exports = {
  getCaptureHandler,
  isSupportedSource,
};
