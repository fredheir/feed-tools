"use strict";

const { getItemMaskKeys } = require("./item");
import { assertFeedDocument } from "./item-shape.js";
import type {
  FeedDocument,
  FeedItem,
  FeedMask,
  FeedTab,
  FeedTabGroup,
} from "./types.js";

function buildThreadAdjacency(
  document: FeedDocument,
): Map<string, Set<string>> {
  const items = document.items;
  const byUrl = new Map<string, FeedItem>();
  const bySourceAndIndex = new Map<string, FeedItem[]>();
  const adjacency = new Map<string, Set<string>>();

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

  function link(a: FeedItem, b: FeedItem): void {
    if (!a?.id || !b?.id || a.id === b.id) return;
    if (!adjacency.has(String(a.id))) adjacency.set(String(a.id), new Set());
    if (!adjacency.has(String(b.id))) adjacency.set(String(b.id), new Set());
    adjacency.get(String(a.id))?.add(String(b.id));
    adjacency.get(String(b.id))?.add(String(a.id));
  }

  for (const item of items) {
    const thread: Partial<FeedItem["thread"]> = item.thread ?? {};
    if (!item?.id) continue;
    let child: FeedItem | null = null;
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

function expandThreadSelection(
  document: FeedDocument,
  identifiers: string[],
): string[] {
  assertFeedDocument(document, "expandThreadSelection");
  const items = document.items;
  const itemByKey = new Map<string, FeedItem>();
  const itemIndexById = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    for (const key of getItemMaskKeys(item)) {
      itemByKey.set(String(key), item);
    }
    if (item?.id) itemIndexById.set(String(item.id), index);
  }

  const adjacency = buildThreadAdjacency(document);
  const seedItems = identifiers
    .map((id) => itemByKey.get(String(id)))
    .filter(Boolean);
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const item of seedItems) {
    if (!item?.id) continue;
    const rootId = String(item.id);
    if (seen.has(rootId)) continue;

    const queue = [rootId];
    const component = new Set([rootId]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const neighbor of adjacency.get(String(current)) || []) {
        if (component.has(neighbor)) continue;
        component.add(neighbor);
        queue.push(neighbor);
      }
    }

    const componentIds = Array.from(component).sort(
      (a, b) =>
        (itemIndexById.get(String(a)) ?? Number.MAX_SAFE_INTEGER) -
        (itemIndexById.get(String(b)) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const id of componentIds) {
      if (seen.has(id)) continue;
      orderedIds.push(String(id));
      seen.add(String(id));
    }
  }

  return orderedIds;
}

function collectMaskIdentifiers(mask: FeedMask): string[] {
  if (Array.isArray(mask.item_ids)) return mask.item_ids;
  if (Array.isArray(mask.tabs)) {
    return mask.tabs.flatMap((tab: FeedTab) => {
      if (Array.isArray(tab.item_ids)) return tab.item_ids;
      if (Array.isArray(tab.groups)) {
        return tab.groups.flatMap((group: FeedTabGroup) =>
          Array.isArray(group.item_ids) ? group.item_ids : [],
        );
      }
      return [];
    });
  }
  return [];
}

function expandMask(document: FeedDocument, mask: FeedMask): FeedMask {
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
      tabs: mask.tabs.map((tab: FeedTab) => {
        if (Array.isArray(tab.item_ids)) {
          return {
            ...tab,
            item_ids: expandThreadSelection(document, tab.item_ids),
          };
        }
        if (Array.isArray(tab.groups)) {
          return {
            ...tab,
            groups: tab.groups.map((group: FeedTabGroup) => ({
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

function applyMask(
  document: FeedDocument,
  mask: FeedMask | null,
): FeedDocument {
  if (!mask) return document;
  assertFeedDocument(document, "applyMask");

  const expandedMask = expandMask(document, mask);

  const itemByKey = new Map<string, FeedItem>();
  for (const item of document.items) {
    for (const key of getItemMaskKeys(item)) {
      itemByKey.set(String(key), item);
    }
  }

  const includeIds = collectMaskIdentifiers(expandedMask);
  if (includeIds.length === 0) {
    return { ...document, mask: expandedMask };
  }

  const seen = new Set<string>();
  const items = includeIds
    .map((id) => String(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => itemByKey.get(id))
    .filter((item): item is FeedItem => Boolean(item));

  return {
    ...document,
    items,
    mask: expandedMask,
  };
}

module.exports = {
  applyMask,
};
