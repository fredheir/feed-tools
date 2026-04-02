"use strict";

const { captureBluesky } = require("../sources/bluesky/capture");
const { prepareBlueskyFeed } = require("../sources/bluesky/capture");
const { captureFacebook } = require("../sources/facebook/capture");
const { prepareFacebookFeed } = require("../sources/facebook/capture");
const { captureLinkedIn } = require("../sources/linkedin/capture");
const { prepareLinkedInFeed } = require("../sources/linkedin/capture");
const { captureX } = require("../sources/x/capture");
const { prepareXFeed } = require("../sources/x/capture");

const CAPTURE_HANDLERS = {
  bluesky: captureBluesky,
  facebook: captureFacebook,
  linkedin: captureLinkedIn,
  x: captureX,
};

const BOOTSTRAP_HANDLERS = {
  bluesky: prepareBlueskyFeed,
  facebook: prepareFacebookFeed,
  linkedin: prepareLinkedInFeed,
  x: prepareXFeed,
};

const SUPPORTED_SOURCES = Object.freeze(Object.keys(CAPTURE_HANDLERS).sort());

function getCaptureHandler(sourceName) {
  return CAPTURE_HANDLERS[sourceName] || null;
}

function isSupportedSource(sourceName) {
  return Boolean(getCaptureHandler(sourceName));
}

function getBootstrapHandler(sourceName) {
  return BOOTSTRAP_HANDLERS[sourceName] || null;
}

function listSupportedSources() {
  return [...SUPPORTED_SOURCES];
}

module.exports = {
  getCaptureHandler,
  getBootstrapHandler,
  isSupportedSource,
  listSupportedSources,
  SUPPORTED_SOURCES,
};
