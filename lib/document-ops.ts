import { assertFeedDocument, getPreferredItemKey } from "./item-shape.js";
import type { FeedDocument, FeedItem } from "./types.js";

interface PruneOptions {
  keep?: string | string[];
  drop?: string | string[];
}

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

function parseIdSpec(spec: string | string[] | undefined): Set<string> {
  if (Array.isArray(spec)) {
    return new Set(spec.map((value) => String(value).trim()).filter(Boolean));
  }

  return new Set(
    String(spec || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function pruneDocument(
  document: FeedDocument,
  options: PruneOptions,
): FeedDocument {
  assertFeedDocument(document, "pruneDocument");
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Use exactly one of keep or drop");
  }
  const { keep, drop } = options;
  if ((keep && drop) || (!keep && !drop)) {
    throw new Error("Use exactly one of keep or drop");
  }
  const idSet = parseIdSpec(keep || drop);
  const items = (document.items || []).filter((item) =>
    keep ? idSet.has(String(item?.id)) : !idSet.has(String(item?.id)),
  );
  return {
    ...document,
    items,
  };
}
