import { DEFAULT_SAVE_DIR } from "../config.ts";
import type { FeedDocument } from "../types.ts";
import {
  normalizeDocument,
  persistCapturedDocument,
} from "../source-capture.ts";
import { collectUniqueItems } from "../feed-item-collection.ts";

export async function ingestDocument(
  rawDocument: unknown,
  {
    sourceName,
    assetsDir,
    saveDir,
    preNormalize,
  }: {
    sourceName: string;
    assetsDir: string;
    saveDir: string;
    preNormalize?: (raw: unknown) => FeedDocument;
  },
): Promise<FeedDocument> {
  const normalized = preNormalize
    ? preNormalize(rawDocument)
    : normalizeDocument(rawDocument, sourceName);
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
