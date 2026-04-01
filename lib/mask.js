"use strict";

const { getItemMaskKeys } = require("./item");

function buildThreadAdjacency(document) {
  const items = Array.isArray(document?.items) ? document.items : [];
  const byUrl = new Map();
  const bySourceAndIndex = new Map();
  const adjacency = new Map();

  for (const item of items) {
    if (item?.url) byUrl.set(String(item.url), item);
    if (item?.index != null) {
      const source = String(item?.source || document?.source || "unknown");
      const key = `${source}:${Number(item.index)}`;
      const bucket = bySourceAndIndex.get(key) || [];
      bucket.push(item);
      bySourceAndIndex.set(key, bucket);
    }
    if (item?.id) adjacency.set(String(item.id), new Set());
  }

  function link(a, b) {
    if (!a?.id || !b?.id || a.id === b.id) return;
    if (!adjacency.has(String(a.id))) adjacency.set(String(a.id), new Set());
    if (!adjacency.has(String(b.id))) adjacency.set(String(b.id), new Set());
    adjacency.get(String(a.id)).add(String(b.id));
    adjacency.get(String(b.id)).add(String(a.id));
  }

  for (const item of items) {
    const thread = item?.thread || {};
    if (!item?.id) continue;
    let child = null;
    if (thread.child_candidate_url) {
      child = byUrl.get(String(thread.child_candidate_url)) || null;
    }
    if (!child && thread.child_candidate_index != null) {
      const source = String(item?.source || document?.source || "unknown");
      const key = `${source}:${Number(thread.child_candidate_index)}`;
      const candidates = bySourceAndIndex.get(key) || [];
      child = candidates.length === 1 ? candidates[0] : null;
    }
    if (child) link(item, child);
  }

  return adjacency;
}

function expandThreadSelection(document, identifiers) {
  const items = Array.isArray(document?.items) ? document.items : [];
  const itemByKey = new Map();
  for (const item of items) {
    for (const key of getItemMaskKeys(item)) {
      itemByKey.set(String(key), item);
    }
  }

  const adjacency = buildThreadAdjacency(document);
  const seedItems = identifiers
    .map((id) => itemByKey.get(String(id)))
    .filter(Boolean);
  const queue = seedItems.map((item) => String(item.id));
  const included = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of adjacency.get(String(current)) || []) {
      if (included.has(neighbor)) continue;
      included.add(neighbor);
      queue.push(neighbor);
    }
  }

  const orderedIds = items
    .filter((item) => item?.id && included.has(String(item.id)))
    .map((item) => String(item.id));

  return orderedIds;
}

function collectMaskIdentifiers(mask) {
  if (Array.isArray(mask.item_ids)) return mask.item_ids;
  if (Array.isArray(mask.tabs)) {
    return mask.tabs.flatMap((tab) => {
      if (Array.isArray(tab.item_ids)) return tab.item_ids;
      if (Array.isArray(tab.groups)) {
        return tab.groups.flatMap((group) =>
          Array.isArray(group.item_ids) ? group.item_ids : [],
        );
      }
      return [];
    });
  }
  return [];
}

function expandMask(document, mask) {
  if (!mask) return mask;
  if (Array.isArray(mask.item_ids)) {
    return {
      ...mask,
      item_ids: expandThreadSelection(document, mask.item_ids),
    };
  }
  if (Array.isArray(mask.tabs)) {
    return {
      ...mask,
      tabs: mask.tabs.map((tab) => {
        if (Array.isArray(tab.item_ids)) {
          return {
            ...tab,
            item_ids: expandThreadSelection(document, tab.item_ids),
          };
        }
        if (Array.isArray(tab.groups)) {
          return {
            ...tab,
            groups: tab.groups.map((group) => ({
              ...group,
              item_ids: expandThreadSelection(document, group.item_ids || []),
            })),
          };
        }
        return tab;
      }),
    };
  }
  return mask;
}

function applyMask(document, mask) {
  if (!mask) return document;
  if (!Array.isArray(document.items)) {
    throw new Error("Expected standardized feed document with .items array");
  }

  const expandedMask = expandMask(document, mask);

  const itemByKey = new Map();
  for (const item of document.items) {
    for (const key of getItemMaskKeys(item)) {
      itemByKey.set(String(key), item);
    }
  }

  const includeIds = collectMaskIdentifiers(expandedMask);
  if (includeIds.length === 0) {
    return { ...document, mask: expandedMask };
  }

  const seen = new Set();
  const items = includeIds
    .map((id) => String(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => itemByKey.get(id))
    .filter(Boolean);

  return {
    ...document,
    items,
    mask: expandedMask,
  };
}

module.exports = {
  applyMask,
};
