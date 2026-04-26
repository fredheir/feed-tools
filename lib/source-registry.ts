import type {
  BrowserSession,
  CaptureAdapter,
  FeedBrowserConfig,
  FeedDocument,
  FeedSourceName,
} from "./types.ts";

import {
  source as blueskySource,
  prepareFeed as prepareBlueskyFeed,
} from "../sources/bluesky/capture.ts";
import {
  source as facebookSource,
  prepareFeed as prepareFacebookFeed,
} from "../sources/facebook/capture.ts";
import {
  source as instagramSource,
  prepareFeed as prepareInstagramFeed,
} from "../sources/instagram/capture.ts";
import {
  source as linkedinSource,
  prepareFeed as prepareLinkedInFeed,
} from "../sources/linkedin/capture.ts";
import {
  source as tiktokSource,
  prepareFeed as prepareTikTokFeed,
} from "../sources/tiktok/capture.ts";
import {
  source as youtubeSource,
  prepareFeed as prepareYouTubeFeed,
} from "../sources/youtube/capture.ts";
import {
  source as xSource,
  prepareFeed as prepareXFeed,
} from "../sources/x/capture.ts";
import { runSourceCapture } from "./source-capture.ts";

type CaptureOptions = {
  limit?: number;
  assetsDir?: string;
  saveDir?: string;
  browserOptions?: FeedBrowserConfig;
};

type BootstrapHandler =
  | ((browser: BrowserSession) => void | Promise<void>)
  | null;

const SOURCE_MODULES: Record<
  FeedSourceName,
  { source: CaptureAdapter; prepareFeed: BootstrapHandler }
> = {
  bluesky: {
    source: blueskySource as CaptureAdapter,
    prepareFeed: prepareBlueskyFeed,
  },
  facebook: {
    source: facebookSource as unknown as CaptureAdapter,
    prepareFeed: prepareFacebookFeed,
  },
  instagram: {
    source: instagramSource as CaptureAdapter,
    prepareFeed: prepareInstagramFeed,
  },
  linkedin: {
    source: linkedinSource as unknown as CaptureAdapter,
    prepareFeed: prepareLinkedInFeed,
  },
  tiktok: {
    source: tiktokSource as CaptureAdapter,
    prepareFeed: prepareTikTokFeed,
  },
  youtube: {
    source: youtubeSource as CaptureAdapter,
    prepareFeed: prepareYouTubeFeed,
  },
  x: { source: xSource as CaptureAdapter, prepareFeed: prepareXFeed },
};

export function getCaptureHandler(
  sourceName: FeedSourceName,
): ((options: CaptureOptions) => Promise<FeedDocument>) | null {
  const sourceModule = SOURCE_MODULES[sourceName];
  if (!sourceModule) return null;
  return function capture(options: CaptureOptions): Promise<FeedDocument> {
    return runSourceCapture(sourceModule.source, options);
  };
}

export function getBootstrapHandler(
  sourceName: FeedSourceName,
): BootstrapHandler {
  return SOURCE_MODULES[sourceName]?.prepareFeed || null;
}
