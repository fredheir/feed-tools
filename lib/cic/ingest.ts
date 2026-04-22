import { DEFAULT_SAVE_DIR } from "../config.js";
import type { FeedDocument } from "../types.js";

const {
  collectUniqueItems,
  normalizeDocument,
  persistCapturedDocument,
} = require("../source-capture.js");

export async function ingestDocument(
  rawDocument: FeedDocument,
  {
    sourceName,
    assetsDir,
    saveDir,
  }: { sourceName: string; assetsDir: string; saveDir: string },
): Promise<FeedDocument> {
  const normalized = normalizeDocument(rawDocument, sourceName);
  const dedupedItems = collectUniqueItems(normalized.items, {
    seen: new Set(),
    sourceName,
  });
  return persistCapturedDocument(
    { ...normalized, items: dedupedItems },
    {
      sourceName,
      assetsDir,
      saveDir: saveDir || DEFAULT_SAVE_DIR,
    },
  );
}
