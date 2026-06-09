import { SOURCE_NAMES, type FeedSourceName } from "./source-metadata.ts";

export const SUPPORTED_SOURCES = SOURCE_NAMES;

export function listSupportedSources(): FeedSourceName[] {
  return [...SUPPORTED_SOURCES];
}

export function isSupportedSource(
  sourceName: string,
): sourceName is FeedSourceName {
  return SUPPORTED_SOURCES.includes(sourceName as FeedSourceName);
}
