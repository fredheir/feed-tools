import {
  getPreferredItemKey,
  normalizeItemShape,
  sanitizeItemId,
  sanitizeSourceItemId,
} from "./item-shape.js";
import type { FeedDocument, FeedItem } from "./types.js";

type MergeableFeedItem = FeedItem & {
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  capture_count?: number | null;
};

type LooseMergeableFeedItem = Parameters<typeof normalizeItemShape>[0];

function stableItemKey(item: FeedItem): string {
  return getPreferredItemKey(item, {
    index: item.index,
  });
}

function mergeValues<T>(
  newValue: T | null | undefined | "",
  oldValue: T | null | undefined,
): T | null {
  if (newValue == null || newValue === "") return oldValue ?? null;
  return newValue;
}

function mergeArrays<T>(
  newArray: T[] | null | undefined,
  oldArray: T[] | null | undefined,
): T[] {
  if (Array.isArray(newArray) && newArray.length > 0) return newArray;
  return Array.isArray(oldArray) ? oldArray : [];
}

function mergeItem(
  oldItem: MergeableFeedItem,
  newItem: MergeableFeedItem,
  capturedAt: string | null,
): MergeableFeedItem {
  const previousCaptureCount =
    typeof oldItem.capture_count === "number" &&
    Number.isInteger(oldItem.capture_count)
      ? oldItem.capture_count
      : 1;
  const source = newItem.source || oldItem.source;
  const merged = normalizeItemShape(
    {
      ...oldItem,
      ...newItem,
      media: mergeArrays(newItem.media, oldItem.media),
      cards: mergeArrays(newItem.cards, oldItem.cards),
      embedded_links: mergeArrays(
        newItem.embedded_links,
        oldItem.embedded_links,
      ),
      author: {
        ...(oldItem.author || {}),
        ...(newItem.author || {}),
      },
      content: {
        ...(oldItem.content || {}),
        ...(newItem.content || {}),
      },
      stats: {
        ...(oldItem.stats || {}),
        ...(newItem.stats || {}),
      },
      thread: {
        ...(oldItem.thread || {}),
        ...(newItem.thread || {}),
      },
    } as LooseMergeableFeedItem,
    {
      source: newItem.source || oldItem.source,
      index: newItem.index ?? oldItem.index,
    },
  );

  return {
    ...merged,
    id:
      mergeValues(
        sanitizeItemId(source, newItem.id),
        sanitizeItemId(source, oldItem.id),
      ) || merged.id,
    source_item_id: mergeValues(
      sanitizeSourceItemId(source, newItem.source_item_id),
      sanitizeSourceItemId(source, oldItem.source_item_id),
    ),
    url: mergeValues(newItem.url, oldItem.url),
    author: {
      handle: mergeValues(newItem.author?.handle, oldItem.author?.handle),
      display_name: mergeValues(
        newItem.author?.display_name,
        oldItem.author?.display_name,
      ),
      profile_image_url: mergeValues(
        newItem.author?.profile_image_url,
        oldItem.author?.profile_image_url,
      ),
      profile_image_local: mergeValues(
        newItem.author?.profile_image_local,
        oldItem.author?.profile_image_local,
      ),
    },
    content: {
      text: mergeValues(newItem.content?.text, oldItem.content?.text),
    },
    stats: {
      reply: mergeValues(newItem.stats?.reply, oldItem.stats?.reply),
      share: mergeValues(newItem.stats?.share, oldItem.stats?.share),
      like: mergeValues(newItem.stats?.like, oldItem.stats?.like),
      view: mergeValues(newItem.stats?.view, oldItem.stats?.view),
    },
    thread: {
      has_thread_line: mergeValues(
        newItem.thread?.has_thread_line,
        oldItem.thread?.has_thread_line,
      ),
      thread_line_height: mergeValues(
        newItem.thread?.thread_line_height,
        oldItem.thread?.thread_line_height,
      ),
      thread_line_x: mergeValues(
        newItem.thread?.thread_line_x,
        oldItem.thread?.thread_line_x,
      ),
      child_candidate_index: mergeValues(
        newItem.thread?.child_candidate_index,
        oldItem.thread?.child_candidate_index,
      ),
      child_candidate_handle: mergeValues(
        newItem.thread?.child_candidate_handle,
        oldItem.thread?.child_candidate_handle,
      ),
      child_candidate_url: mergeValues(
        newItem.thread?.child_candidate_url,
        oldItem.thread?.child_candidate_url,
      ),
      relationship_confidence: mergeValues(
        newItem.thread?.relationship_confidence,
        oldItem.thread?.relationship_confidence,
      ),
    },
    media: mergeArrays(newItem.media, oldItem.media),
    cards: mergeArrays(newItem.cards, oldItem.cards),
    embedded_links: mergeArrays(newItem.embedded_links, oldItem.embedded_links),
    first_seen_at: oldItem.first_seen_at || capturedAt,
    last_seen_at: capturedAt,
    capture_count: previousCaptureCount + 1,
  } as MergeableFeedItem;
}

export function mergeDocuments(
  oldDocument: FeedDocument | null | undefined,
  newDocument: FeedDocument,
): FeedDocument {
  if (!oldDocument || !Array.isArray(oldDocument.items)) {
    return {
      ...newDocument,
      items: newDocument.items.map((item) => ({
        ...normalizeItemShape(item, {
          source: item.source || newDocument.source,
          index: item.index,
        }),
        first_seen_at: newDocument.captured_at,
        last_seen_at: newDocument.captured_at,
        capture_count: 1,
      })),
    };
  }
  if (!newDocument || !Array.isArray(newDocument.items)) return oldDocument;

  const capturedAt = newDocument.captured_at;
  const oldByKey = new Map(
    oldDocument.items.map((item) => [stableItemKey(item), item]),
  );
  const mergedItems: MergeableFeedItem[] = [];
  const seen = new Set();

  for (const item of newDocument.items) {
    const key = stableItemKey(item);
    const oldItem = oldByKey.get(key);
    const merged = oldItem
      ? mergeItem(oldItem, item, capturedAt)
      : {
          ...normalizeItemShape(item, {
            source: item.source || newDocument.source,
            index: item.index,
          }),
          first_seen_at: capturedAt,
          last_seen_at: capturedAt,
          capture_count: 1,
        };
    mergedItems.push(merged);
    seen.add(key);
  }

  for (const item of oldDocument.items) {
    const key = stableItemKey(item);
    if (seen.has(key)) continue;
    mergedItems.push({
      ...normalizeItemShape(item, {
        source: item.source || oldDocument.source,
        index: item.index,
      }),
      first_seen_at: item.first_seen_at || oldDocument.captured_at,
      last_seen_at: item.last_seen_at || oldDocument.captured_at,
      capture_count: Number.isInteger(item.capture_count)
        ? item.capture_count
        : 1,
    });
  }

  return {
    schema_version: newDocument.schema_version,
    source: newDocument.source,
    captured_at: newDocument.captured_at,
    items: mergedItems,
  };
}
