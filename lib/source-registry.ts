import type {
  FeedBrowserConfig,
  FeedDocument,
  FeedSourceName,
} from "./types.ts";

import { runSourceCapture } from "./source-capture.ts";
import { getSourceManifest, type SourceManifest } from "./source-manifest.ts";

type CaptureOptions = {
  limit?: number;
  assetsDir?: string;
  saveDir?: string;
  browserOptions?: FeedBrowserConfig;
};

export function getCaptureHandler(
  sourceName: FeedSourceName,
): ((options: CaptureOptions) => Promise<FeedDocument>) | null {
  const manifest = getSourceManifest(sourceName);
  if (!manifest) return null;
  return function capture(options: CaptureOptions): Promise<FeedDocument> {
    return runSourceCapture(manifest.capture, options);
  };
}

export function getBootstrapHandler(
  sourceName: FeedSourceName,
): SourceManifest["prepareFeed"] {
  return getSourceManifest(sourceName)?.prepareFeed || null;
}
