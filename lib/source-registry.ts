import { isSupportedSource, listSupportedSources } from "./source-catalog.js";

const {
  source: blueskySource,
  prepareFeed: prepareBlueskyFeed,
} = require("../sources/bluesky/capture.js");
const {
  source: facebookSource,
  prepareFeed: prepareFacebookFeed,
} = require("../sources/facebook/capture.js");
const {
  source: instagramSource,
  prepareFeed: prepareInstagramFeed,
} = require("../sources/instagram/capture.js");
const {
  source: linkedinSource,
  prepareFeed: prepareLinkedInFeed,
} = require("../sources/linkedin/capture.js");
const {
  source: tiktokSource,
  prepareFeed: prepareTikTokFeed,
} = require("../sources/tiktok/capture.js");
const {
  source: xSource,
  prepareFeed: prepareXFeed,
} = require("../sources/x/capture.js");
const { runSourceCapture } = require("./source-capture.js");
import type { FeedDocument, NormalizedBrowserOptions } from "./types.js";

type CaptureOptions = {
  limit?: number;
  assetsDir?: string;
  saveDir?: string;
  browserOptions?: Record<string, unknown>;
};

type CaptureAdapter = {
  name: string;
  captureDocument: (options: {
    limit: number;
    browserOptions: NormalizedBrowserOptions;
  }) => Promise<FeedDocument>;
};

type BootstrapHandler = ((browser: unknown) => void | Promise<void>) | null;

const SOURCE_MODULES: Record<
  string,
  { source: CaptureAdapter; prepareFeed: BootstrapHandler }
> = {
  bluesky: { source: blueskySource, prepareFeed: prepareBlueskyFeed },
  facebook: { source: facebookSource, prepareFeed: prepareFacebookFeed },
  instagram: { source: instagramSource, prepareFeed: prepareInstagramFeed },
  linkedin: { source: linkedinSource, prepareFeed: prepareLinkedInFeed },
  tiktok: { source: tiktokSource, prepareFeed: prepareTikTokFeed },
  x: { source: xSource, prepareFeed: prepareXFeed },
};

export function getCaptureHandler(
  sourceName: string,
): ((options: CaptureOptions) => Promise<FeedDocument>) | null {
  const sourceModule = SOURCE_MODULES[sourceName];
  if (!sourceModule) return null;
  return function capture(options: CaptureOptions): Promise<FeedDocument> {
    return runSourceCapture(sourceModule.source, options);
  };
}

export function getBootstrapHandler(sourceName: string): BootstrapHandler {
  return SOURCE_MODULES[sourceName]?.prepareFeed || null;
}

export { isSupportedSource, listSupportedSources };
