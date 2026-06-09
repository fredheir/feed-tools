import type { FeedSourceName, SourceSigninTarget } from "./source-metadata.ts";
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
