import { SOURCE_NAMES, type FeedSourceName } from "./source-metadata.ts";

export const SUPPORTED_SOURCES = Object.freeze([...SOURCE_NAMES]);

export function isSupportedSource(
  sourceName: string,
): sourceName is FeedSourceName {
  return (SOURCE_NAMES as readonly string[]).includes(sourceName);
}
