import {
  source as blueskySource,
  prepareFeed as prepareBlueskyFeed,
  buildExtractionScript as buildBlueskyExtractionScript,
} from "../sources/bluesky/capture.ts";
import {
  source as facebookSource,
  prepareFeed as prepareFacebookFeed,
  buildExtractionScript as buildFacebookExtractionScript,
  normalizeFacebookExtractionDocument,
} from "../sources/facebook/capture.ts";
import {
  source as instagramSource,
  prepareFeed as prepareInstagramFeed,
  buildExtractionScript as buildInstagramExtractionScript,
  normalizeInstagramExtractionDocument,
} from "../sources/instagram/capture.ts";
import {
  source as linkedinSource,
  prepareFeed as prepareLinkedInFeed,
  buildExtractionScript as buildLinkedInExtractionScript,
} from "../sources/linkedin/capture.ts";
import {
  source as tiktokSource,
  prepareFeed as prepareTikTokFeed,
  buildExtractionScript as buildTikTokExtractionScript,
} from "../sources/tiktok/capture.ts";
import {
  source as youtubeSource,
  prepareFeed as prepareYouTubeFeed,
  buildExtractionScript as buildYouTubeExtractionScript,
  normalizeYouTubeExtractionDocument,
} from "../sources/youtube/capture.ts";
import {
  source as xSource,
  prepareFeed as prepareXFeed,
  buildExtractionScript as buildXExtractionScript,
} from "../sources/x/capture.ts";
import {
  SOURCE_SIGNIN_TARGETS,
  type FeedSourceName,
  type SourceSigninTarget,
} from "./source-metadata.ts";
import type { BrowserSession, CaptureAdapter, FeedDocument } from "./types.ts";

type BootstrapHandler =
  | ((browser: BrowserSession) => void | Promise<void>)
  | null;

export interface SourceManifest {
  name: FeedSourceName;
  capture: CaptureAdapter;
  prepareFeed: BootstrapHandler;
  cic: {
    buildExtractionScript: (limit: number) => string;
    preNormalize?: (raw: unknown) => FeedDocument;
  };
  signin: SourceSigninTarget;
}

export const SOURCE_MANIFESTS = {
  bluesky: {
    name: "bluesky",
    capture: blueskySource,
    prepareFeed: prepareBlueskyFeed,
    cic: { buildExtractionScript: buildBlueskyExtractionScript },
    signin: SOURCE_SIGNIN_TARGETS.bluesky,
  },
  facebook: {
    name: "facebook",
    capture: facebookSource,
    prepareFeed: prepareFacebookFeed,
    cic: {
      buildExtractionScript: buildFacebookExtractionScript,
      preNormalize: normalizeFacebookExtractionDocument,
    },
    signin: SOURCE_SIGNIN_TARGETS.facebook,
  },
  instagram: {
    name: "instagram",
    capture: instagramSource,
    prepareFeed: prepareInstagramFeed,
    cic: {
      buildExtractionScript: buildInstagramExtractionScript,
      preNormalize: normalizeInstagramExtractionDocument,
    },
    signin: SOURCE_SIGNIN_TARGETS.instagram,
  },
  linkedin: {
    name: "linkedin",
    capture: linkedinSource,
    prepareFeed: prepareLinkedInFeed,
    cic: { buildExtractionScript: buildLinkedInExtractionScript },
    signin: SOURCE_SIGNIN_TARGETS.linkedin,
  },
  tiktok: {
    name: "tiktok",
    capture: tiktokSource,
    prepareFeed: prepareTikTokFeed,
    cic: { buildExtractionScript: buildTikTokExtractionScript },
    signin: SOURCE_SIGNIN_TARGETS.tiktok,
  },
  youtube: {
    name: "youtube",
    capture: youtubeSource,
    prepareFeed: prepareYouTubeFeed,
    cic: {
      buildExtractionScript: buildYouTubeExtractionScript,
      preNormalize: normalizeYouTubeExtractionDocument,
    },
    signin: SOURCE_SIGNIN_TARGETS.youtube,
  },
  x: {
    name: "x",
    capture: xSource,
    prepareFeed: prepareXFeed,
    cic: { buildExtractionScript: buildXExtractionScript },
    signin: SOURCE_SIGNIN_TARGETS.x,
  },
} satisfies Record<FeedSourceName, SourceManifest>;

export function getSourceManifest(sourceName: string): SourceManifest | null {
  if (!Object.prototype.hasOwnProperty.call(SOURCE_MANIFESTS, sourceName)) {
    return null;
  }
  return SOURCE_MANIFESTS[sourceName as FeedSourceName];
}

export function listSourceManifests(): SourceManifest[] {
  return Object.values(SOURCE_MANIFESTS);
}
