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
  source: instagramSource,
  prepareFeed: prepareInstagramFeed,
} = require("../sources/instagram/capture");
const {
  source: linkedinSource,
  prepareFeed: prepareLinkedInFeed,
} = require("../sources/linkedin/capture");
const {
  source: tiktokSource,
  prepareFeed: prepareTikTokFeed,
} = require("../sources/tiktok/capture");
const {
  source: xSource,
  prepareFeed: prepareXFeed,
} = require("../sources/x/capture");

const SOURCE_MODULES = {
  bluesky: { source: blueskySource, prepareFeed: prepareBlueskyFeed },
  facebook: { source: facebookSource, prepareFeed: prepareFacebookFeed },
  instagram: { source: instagramSource, prepareFeed: prepareInstagramFeed },
  linkedin: { source: linkedinSource, prepareFeed: prepareLinkedInFeed },
  tiktok: { source: tiktokSource, prepareFeed: prepareTikTokFeed },
  x: { source: xSource, prepareFeed: prepareXFeed },
};

function getCaptureHandler(sourceName) {
  const sourceModule = SOURCE_MODULES[sourceName];
  if (!sourceModule) return null;
  return function capture(options) {
    return runSourceCapture(sourceModule.source, options);
  };
}

function getBootstrapHandler(sourceName) {
  return SOURCE_MODULES[sourceName]?.prepareFeed || null;
}

module.exports = {
  getBootstrapHandler,
  getCaptureHandler,
  isSupportedSource,
  listSupportedSources,
};
