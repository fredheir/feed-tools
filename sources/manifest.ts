import {
  source as blueskySource,
  buildExtractionScript as buildBlueskyExtractionScript,
} from "./bluesky/capture.ts";
import {
  source as facebookSource,
  buildExtractionScript as buildFacebookExtractionScript,
  normalizeFacebookExtractionDocument,
} from "./facebook/capture.ts";
import {
  source as instagramSource,
  buildExtractionScript as buildInstagramExtractionScript,
  normalizeInstagramExtractionDocument,
} from "./instagram/capture.ts";
import {
  source as linkedinSource,
  buildExtractionScript as buildLinkedInExtractionScript,
} from "./linkedin/capture.ts";
import {
  source as tiktokSource,
  buildExtractionScript as buildTikTokExtractionScript,
} from "./tiktok/capture.ts";
import {
  source as youtubeSource,
  buildExtractionScript as buildYouTubeExtractionScript,
  normalizeYouTubeExtractionDocument,
} from "./youtube/capture.ts";
import {
  source as xSource,
  buildExtractionScript as buildXExtractionScript,
} from "./x/capture.ts";
import { SOURCE_NAMES, type FeedSourceName } from "../lib/source-metadata.ts";
import type { SourceManifest } from "../lib/source-manifest.ts";

const SOURCE_MANIFESTS = {
  bluesky: {
    name: "bluesky",
    capture: blueskySource,
    cic: { buildExtractionScript: buildBlueskyExtractionScript },
  },
  facebook: {
    name: "facebook",
    capture: facebookSource,
    cic: {
      buildExtractionScript: buildFacebookExtractionScript,
      preNormalize: normalizeFacebookExtractionDocument,
    },
  },
  instagram: {
    name: "instagram",
    capture: instagramSource,
    cic: {
      buildExtractionScript: buildInstagramExtractionScript,
      preNormalize: normalizeInstagramExtractionDocument,
    },
  },
  linkedin: {
    name: "linkedin",
    capture: linkedinSource,
    cic: { buildExtractionScript: buildLinkedInExtractionScript },
  },
  tiktok: {
    name: "tiktok",
    capture: tiktokSource,
    cic: { buildExtractionScript: buildTikTokExtractionScript },
  },
  youtube: {
    name: "youtube",
    capture: youtubeSource,
    cic: {
      buildExtractionScript: buildYouTubeExtractionScript,
      preNormalize: normalizeYouTubeExtractionDocument,
    },
  },
  x: {
    name: "x",
    capture: xSource,
    cic: { buildExtractionScript: buildXExtractionScript },
  },
} satisfies Record<FeedSourceName, SourceManifest>;

const SUPPORTED_SOURCE_NAMES = Object.freeze(
  Object.keys(SOURCE_MANIFESTS),
) as readonly FeedSourceName[];

if (
  [...SUPPORTED_SOURCE_NAMES].sort().join("\0") !==
  [...SOURCE_NAMES].sort().join("\0")
) {
  throw new Error("Source manifest names must match source metadata names");
}

function getSourceManifest(sourceName: string): SourceManifest | null {
  if (!Object.prototype.hasOwnProperty.call(SOURCE_MANIFESTS, sourceName)) {
    return null;
  }
  return SOURCE_MANIFESTS[sourceName as FeedSourceName];
}

function listSourceManifests(): SourceManifest[] {
  return Object.values(SOURCE_MANIFESTS);
}

export { getSourceManifest, listSourceManifests };
