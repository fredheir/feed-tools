"use strict";

const { getPreferredItemKey } = require("./item-shape");

function getDocumentItemKey(item) {
  return getPreferredItemKey(item, {
    index: item.index,
  });
}

function combineDocuments(documents) {
  const capturedAt =
    documents
      .map((doc) => doc.captured_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
  const seen = new Set();
  const items = [];

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

function parseIdSpec(spec) {
  return new Set(
    String(spec || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function pruneDocument(document, options) {
  const { keep, drop } = options;
  if ((keep && drop) || (!keep && !drop)) {
    throw new Error("Use exactly one of keep or drop");
  }
  const idSet = parseIdSpec(keep || drop);
  const items = (document.items || []).filter((item) =>
    keep ? idSet.has(String(item.id)) : !idSet.has(String(item.id)),
  );
  return {
    ...document,
    items,
  };
}

module.exports = {
  combineDocuments,
  pruneDocument,
};
