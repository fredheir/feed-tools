import type { FeedSourceName } from "./types.ts";

export const SUPPORTED_SOURCES = Object.freeze([
  "bluesky",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "x",
]) satisfies readonly FeedSourceName[];

export function listSupportedSources(): FeedSourceName[] {
  return [...SUPPORTED_SOURCES];
}

export function isSupportedSource(
  sourceName: string,
): sourceName is FeedSourceName {
  return SUPPORTED_SOURCES.includes(sourceName as FeedSourceName);
}
