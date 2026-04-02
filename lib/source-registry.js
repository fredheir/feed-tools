"use strict";

const { runSourceCapture } = require("./source-capture");
const { isSupportedSource, listSupportedSources } = require("./source-catalog");
const {
  source: blueskySource,
  prepareFeed: prepareBlueskyFeed,
} = require("../sources/bluesky/capture");
const {
  source: facebookSource,
  prepareFeed: prepareFacebookFeed,
} = require("../sources/facebook/capture");
const {
  source: linkedinSource,
  prepareFeed: prepareLinkedInFeed,
} = require("../sources/linkedin/capture");
const {
  source: xSource,
  prepareFeed: prepareXFeed,
} = require("../sources/x/capture");

const SOURCES = {
  bluesky: blueskySource,
  facebook: facebookSource,
  linkedin: linkedinSource,
  x: xSource,
};

const BOOTSTRAP_HANDLERS = {
  bluesky: prepareBlueskyFeed,
  facebook: prepareFacebookFeed,
  linkedin: prepareLinkedInFeed,
  x: prepareXFeed,
};

function getCaptureHandler(sourceName) {
  const source = SOURCES[sourceName];
  if (!source) return null;
  return function capture(options) {
    return runSourceCapture(source, options);
  };
}

module.exports = {
  getCaptureHandler,
  isSupportedSource,
  listSupportedSources,
};
