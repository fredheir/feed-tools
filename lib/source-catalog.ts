import {
  isManifestSourceName,
  listManifestSourceNames,
} from "../sources/manifest.ts";
import type { FeedSourceName } from "./source-metadata.ts";

export const SUPPORTED_SOURCES = Object.freeze(listManifestSourceNames());

export function listSupportedSources(): FeedSourceName[] {
  return [...SUPPORTED_SOURCES];
}

export function isSupportedSource(
  sourceName: string,
): sourceName is FeedSourceName {
  return isManifestSourceName(sourceName);
}
