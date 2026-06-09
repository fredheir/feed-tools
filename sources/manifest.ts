import {
  source as blueskySource,
  prepareFeed as prepareBlueskyFeed,
  buildExtractionScript as buildBlueskyExtractionScript,
} from "./bluesky/capture.ts";
import {
  source as facebookSource,
  prepareFeed as prepareFacebookFeed,
  buildExtractionScript as buildFacebookExtractionScript,
  normalizeFacebookExtractionDocument,
} from "./facebook/capture.ts";
import {
  source as instagramSource,
  prepareFeed as prepareInstagramFeed,
  buildExtractionScript as buildInstagramExtractionScript,
  normalizeInstagramExtractionDocument,
} from "./instagram/capture.ts";
import {
  source as linkedinSource,
  prepareFeed as prepareLinkedInFeed,
  buildExtractionScript as buildLinkedInExtractionScript,
} from "./linkedin/capture.ts";
import {
  source as tiktokSource,
  prepareFeed as prepareTikTokFeed,
  buildExtractionScript as buildTikTokExtractionScript,
} from "./tiktok/capture.ts";
import {
  source as youtubeSource,
  prepareFeed as prepareYouTubeFeed,
  buildExtractionScript as buildYouTubeExtractionScript,
  normalizeYouTubeExtractionDocument,
} from "./youtube/capture.ts";
import {
  source as xSource,
  prepareFeed as prepareXFeed,
  buildExtractionScript as buildXExtractionScript,
} from "./x/capture.ts";
import {
  SOURCE_SIGNIN_TARGETS,
  type FeedSourceName,
} from "../lib/source-metadata.ts";
import type { SourceManifest } from "../lib/source-manifest.ts";

const SOURCE_MANIFESTS = {
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

function getSourceManifest(sourceName: string): SourceManifest | null {
  if (!Object.prototype.hasOwnProperty.call(SOURCE_MANIFESTS, sourceName)) {
    return null;
  }
  return SOURCE_MANIFESTS[sourceName as FeedSourceName];
}

function listSourceManifests(): SourceManifest[] {
  return Object.values(SOURCE_MANIFESTS);
}

export { getSourceManifest, listSourceManifests, SOURCE_MANIFESTS };
