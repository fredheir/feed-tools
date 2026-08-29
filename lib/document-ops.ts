import { assertFeedDocument, getPreferredItemKey } from "./item-shape.ts";
import type { FeedDocument, FeedItem } from "./types.ts";

function getDocumentItemKey(item: FeedItem): string {
  return getPreferredItemKey(item, {
    index: item?.index,
  });
}

export function combineDocuments(documents: FeedDocument[]): FeedDocument {
  if (!Array.isArray(documents)) {
    throw new Error("Expected an array of standardized feed documents");
  }

  for (const document of documents) {
    assertFeedDocument(document, "combineDocuments");
  }

  const capturedAt =
    documents
      .map((doc) => doc.captured_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
  const seen = new Set();
  const items: FeedItem[] = [];

  for (const document of documents) {
    for (const item of document.items || []) {
      const key = getDocumentItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  return {
    schema_version: 1,
    source: "combined",
    captured_at: capturedAt,
    items,
  };
}
