import { DEFAULT_SAVE_DIR } from "../config.ts";
import type { FeedDocument } from "../types.ts";

import {
  collectUniqueItems,
  normalizeDocument,
  persistCapturedDocument,
} from "../source-capture.ts";

export async function ingestDocument(
  rawDocument: unknown,
  {
    sourceName,
    assetsDir,
    saveDir,
  }: { sourceName: string; assetsDir: string; saveDir: string },
): Promise<FeedDocument> {
  const normalized = normalizeDocument(rawDocument, sourceName);
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
