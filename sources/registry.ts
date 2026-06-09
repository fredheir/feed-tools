import { runSourceCapture } from "../lib/source-capture.ts";
import type { SourceManifest } from "../lib/source-manifest.ts";
import type {
  FeedBrowserConfig,
  FeedDocument,
  FeedSourceName,
} from "../lib/types.ts";
import { getSourceManifest } from "./manifest.ts";

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
