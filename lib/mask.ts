"use strict";

const { getItemMaskKeys } = require("./item");
import { assertFeedDocument } from "./item-shape.js";
import type { FeedDocument, FeedItem, FeedMask, FeedTab } from "./types.js";

function hasMaskTabs(mask: FeedMask): mask is FeedMask & { tabs: FeedTab[] } {
  return "tabs" in mask && Array.isArray(mask.tabs);
}

function hasMaskItemIds(
  mask: FeedMask,
): mask is FeedMask & { item_ids: string[] } {
  return "item_ids" in mask && Array.isArray(mask.item_ids);
}

function resolveThreadChild(
  item: FeedItem,
  document: FeedDocument,
  byUrl: Map<string, FeedItem>,
  bySourceAndIndex: Map<string, FeedItem[]>,
): FeedItem | null {
  const thread = item.thread ?? {};
  if (thread.child_candidate_url) {
    return byUrl.get(String(thread.child_candidate_url)) || null;
  }
  if (thread.child_candidate_index == null) {
    return null;
  }

  const source = item.source || document.source || "unknown";
  const key = `${source}:${Number(thread.child_candidate_index)}`;
  const candidates = bySourceAndIndex.get(key) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function buildThreadLinks(document: FeedDocument): Map<string, string> {
  const items = document.items;
  const byUrl = new Map<string, FeedItem>();
  const bySourceAndIndex = new Map<string, FeedItem[]>();
  const links = new Map<string, string>();

  for (const item of items) {
    if (item?.url) byUrl.set(item.url, item);
    if (item?.index != null) {
      const source = item.source || document.source || "unknown";
      const key = `${source}:${Number(item.index)}`;
      const bucket = bySourceAndIndex.get(key) || [];
      bucket.push(item);
      bySourceAndIndex.set(key, bucket);
    }
  }

  for (const item of items) {
    if (!item?.id) continue;
    const child = resolveThreadChild(item, document, byUrl, bySourceAndIndex);
    if (!child?.id || child.id === item.id) continue;
    links.set(item.id, child.id);
  }

  return links;
}

function buildThreadAdjacency(
  document: FeedDocument,
  links: Map<string, string> = buildThreadLinks(document),
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const item of document.items) {
    if (item?.id) adjacency.set(item.id, new Set());
  }
  for (const [parentId, childId] of links) {
    if (!adjacency.has(parentId)) adjacency.set(parentId, new Set());
    if (!adjacency.has(childId)) adjacency.set(childId, new Set());
    adjacency.get(parentId)?.add(childId);
    adjacency.get(childId)?.add(parentId);
  }
  return adjacency;
}

function orderItemsByThread(
  document: FeedDocument,
  links: Map<string, string> = buildThreadLinks(document),
): FeedItem[] {
  const rows = Array.isArray(document.items) ? document.items : [];
  const byId = new Map<string, FeedItem>();
  const originalIndexById = new Map<string, number>();
  const childToParent = new Map<string, string>();

  for (const [index, item] of rows.entries()) {
    if (!item?.id) continue;
    byId.set(item.id, item);
    originalIndexById.set(item.id, index);
  }

  for (const [parentId, childId] of links) {
    childToParent.set(childId, parentId);
  }

  function getChainRoot(id: string): string {
    let currentId = id;
    if (!currentId) return "";
    const seen = new Set<string>();
    while (childToParent.has(currentId) && !seen.has(currentId)) {
      seen.add(currentId);
      currentId = childToParent.get(currentId) || currentId;
    }
    return currentId;
  }

  const chainBuckets = new Map<string, FeedItem[]>();
  for (const item of rows) {
    if (!item?.id) continue;
    const rootId = getChainRoot(item.id) || item.id;
    const bucket = chainBuckets.get(rootId) || [];
    bucket.push(item);
    chainBuckets.set(rootId, bucket);
  }

  const orderedByRoot = new Map<string, FeedItem[]>();
  for (const [rootId, bucket] of chainBuckets.entries()) {
    const childrenByParent = new Map<string, FeedItem[]>();
    for (const item of bucket) {
      if (!item.id) continue;
      const parentId = childToParent.get(item.id);
      if (!parentId) continue;
      const siblings = childrenByParent.get(parentId) || [];
      siblings.push(item);
      childrenByParent.set(parentId, siblings);
    }
    for (const siblings of childrenByParent.values()) {
      siblings.sort(
        (a, b) =>
          (originalIndexById.get(a.id ?? "") ?? Number.MAX_SAFE_INTEGER) -
          (originalIndexById.get(b.id ?? "") ?? Number.MAX_SAFE_INTEGER),
      );
    }

    const root = byId.get(rootId) || bucket[0];
    const ordered: FeedItem[] = [];
    const stack: FeedItem[] = root ? [root] : [];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current?.id || seen.has(current.id)) continue;
      seen.add(current.id);
      ordered.push(current);
      const children = childrenByParent.get(current.id) || [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child) stack.push(child);
      }
    }

    for (const item of bucket) {
      if (!item.id || seen.has(item.id)) continue;
      ordered.push(item);
    }
    orderedByRoot.set(rootId, ordered);
  }

  const emittedRoots = new Set<string>();
  const result: FeedItem[] = [];
  for (const item of rows) {
    if (!item?.id) {
      result.push(item);
      continue;
    }
    const rootId = getChainRoot(item.id) || item.id;
    if (emittedRoots.has(rootId)) continue;
    emittedRoots.add(rootId);
    result.push(...(orderedByRoot.get(rootId) || [item]));
  }
  return result;
}

interface ExpansionContext {
  itemByKey: Map<string, FeedItem>;
  adjacency: Map<string, Set<string>>;
  orderedIds: string[];
}

function buildExpansionContext(document: FeedDocument): ExpansionContext {
  const links = buildThreadLinks(document);
  const adjacency = buildThreadAdjacency(document, links);
  const orderedIds = orderItemsByThread(document, links)
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));

  const itemByKey = new Map<string, FeedItem>();
  for (const item of document.items) {
    for (const key of getItemMaskKeys(item)) {
      itemByKey.set(String(key), item);
    }
  }

  return { itemByKey, adjacency, orderedIds };
}

function expandThreadSelection(
  identifiers: string[],
  context: ExpansionContext,
): string[] {
  const { itemByKey, adjacency, orderedIds } = context;
  const seedItems = identifiers
    .map((id) => itemByKey.get(String(id)))
    .filter(Boolean);
  const expandedIds: string[] = [];
  const seen = new Set<string>();
  for (const item of seedItems) {
    if (!item?.id) continue;
    const rootId = item.id;
    if (seen.has(rootId)) continue;

    const queue = [rootId];
    const component = new Set([rootId]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const neighbor of adjacency.get(current) || []) {
        if (component.has(neighbor)) continue;
        component.add(neighbor);
        queue.push(neighbor);
      }
    }

    const componentIdSet = new Set<string>();
    const componentIds: string[] = [];
    for (const id of orderedIds) {
      if (!component.has(id) || componentIdSet.has(id)) continue;
      componentIds.push(id);
      componentIdSet.add(id);
    }
    for (const id of component) {
      if (componentIdSet.has(id)) continue;
      componentIds.push(id);
      componentIdSet.add(id);
    }
    for (const id of componentIds) {
      if (seen.has(id)) continue;
      expandedIds.push(id);
      seen.add(id);
    }
  }

  return expandedIds;
}

function collectMaskIdentifiers(mask: FeedMask): string[] {
  if (hasMaskTabs(mask)) {
    return mask.tabs.flatMap((tab: FeedTab) =>
      tab.groups.flatMap((group) => group.item_ids),
    );
  }
  if (hasMaskItemIds(mask)) return mask.item_ids;
  return [];
}

function assertSingularMaskSelection(mask: FeedMask): void {
  if (hasMaskItemIds(mask) && hasMaskTabs(mask)) {
    throw new Error("FeedMask cannot contain both item_ids and tabs");
  }
}

function expandMask(document: FeedDocument, mask: FeedMask): FeedMask {
  if (!mask) return mask;
  assertSingularMaskSelection(mask);
  if (!hasMaskTabs(mask) && !hasMaskItemIds(mask)) return mask;

  const context = buildExpansionContext(document);

  if (hasMaskTabs(mask)) {
    return {
      ...mask,
      tabs: mask.tabs.map((tab: FeedTab) => ({
        ...tab,
        groups: tab.groups.map((group) => ({
          ...group,
          item_ids: expandThreadSelection(group.item_ids, context),
        })),
      })),
    };
  }
  return {
    ...mask,
    item_ids: expandThreadSelection(mask.item_ids, context),
  };
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
  orderItemsByThread,
};
