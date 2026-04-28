import { DEFAULT_SAVE_DIR } from "../config.ts";
import type { FeedDocument } from "../types.ts";

import {
  collectUniqueItems,
  normalizeDocument,
  persistCapturedDocument,
} from "../source-capture.ts";

import { normalizeFacebookExtractionDocument } from "../../sources/facebook/capture.ts";
import { normalizeInstagramExtractionDocument } from "../../sources/instagram/capture.ts";
import { normalizeYouTubeExtractionDocument } from "../../sources/youtube/capture.ts";

/**
 * Per-source pre-normalisers convert the raw extraction payload (as emitted
 * by `buildExtractionScript`) into the canonical FeedDocument shape that the
 * generic `normalizeDocument` expects.  Sources whose extraction already
 * emits canonical items can omit the entry.
 */
const PRE_NORMALISERS: Record<string, (raw: unknown) => FeedDocument> = {
  instagram: normalizeInstagramExtractionDocument,
  youtube: normalizeYouTubeExtractionDocument,
  facebook: normalizeFacebookExtractionDocument,
};

function preNormalise(rawDocument: unknown, sourceName: string): FeedDocument {
  const fn = PRE_NORMALISERS[sourceName];
  if (fn) return fn(rawDocument);
  return normalizeDocument(rawDocument, sourceName);
}

export async function ingestDocument(
  rawDocument: unknown,
  {
    sourceName,
    assetsDir,
    saveDir,
  }: { sourceName: string; assetsDir: string; saveDir: string },
): Promise<FeedDocument> {
  const normalized = preNormalise(rawDocument, sourceName);
  const dedupedItems = collectUniqueItems<FeedDocument["items"][number]>(
    normalized.items,
    {
      seen: new Set(),
      sourceName,
    },
  );
  return persistCapturedDocument(
    { ...normalized, items: dedupedItems },
    {
      sourceName,
      assetsDir,
      saveDir: saveDir || DEFAULT_SAVE_DIR,
    },
  );
}
