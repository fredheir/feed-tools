import type { FeedSourceName } from "./source-metadata.ts";
import type { CaptureAdapter, FeedDocument } from "./types.ts";

export interface SourceManifest {
  name: FeedSourceName;
  capture: CaptureAdapter;
  cic: {
    buildExtractionScript: (limit: number) => string;
    preNormalize?: (raw: unknown) => FeedDocument;
  };
}
