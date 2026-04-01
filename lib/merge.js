"use strict";

const { getItemStableId } = require("./item");

function stableItemKey(item) {
  return (
    getItemStableId(item) ||
    item.source_item_id ||
    item.url ||
    `${item.source || "unknown"}:${item.index || "no-index"}`
  );
}

function mergeValues(newValue, oldValue) {
  if (newValue == null || newValue === "") return oldValue ?? null;
  return newValue;
}

function mergeArrays(newArray, oldArray) {
  if (Array.isArray(newArray) && newArray.length > 0) return newArray;
  return Array.isArray(oldArray) ? oldArray : [];
}

function mergeItem(oldItem, newItem, capturedAt) {
  const previousCaptureCount = Number.isInteger(oldItem.capture_count)
    ? oldItem.capture_count
    : 1;
  const mergedMedia = mergeArrays(
    newItem.media || newItem.embedded_media,
    oldItem.media || oldItem.embedded_media,
  );
  const mergedCards = mergeArrays(
    newItem.cards || newItem.preview_cards,
    oldItem.cards || oldItem.preview_cards,
  );
  return {
    ...oldItem,
    ...newItem,
    id: mergeValues(newItem.id, oldItem.id),
    source_item_id: mergeValues(newItem.source_item_id, oldItem.source_item_id),
    handle: mergeValues(newItem.handle, oldItem.handle),
    url: mergeValues(newItem.url, oldItem.url),
    text: mergeValues(newItem.text, oldItem.text),
    profile_image_url: mergeValues(
      newItem.profile_image_url,
      oldItem.profile_image_url,
    ),
    profile_image_local: mergeValues(
      newItem.profile_image_local,
      oldItem.profile_image_local,
    ),
    embedded_links: mergeArrays(newItem.embedded_links, oldItem.embedded_links),
    embedded_media: mergedMedia,
    media: mergedMedia,
    preview_cards: mergedCards,
    cards: mergedCards,
    author: {
      ...(oldItem.author || {}),
      ...(newItem.author || {}),
      handle: mergeValues(
        newItem.author?.handle,
        oldItem.author?.handle || oldItem.handle,
      ),
      display_name: mergeValues(
        newItem.author?.display_name,
        oldItem.author?.display_name,
      ),
      profile_image_url: mergeValues(
        newItem.author?.profile_image_url,
        oldItem.author?.profile_image_url || oldItem.profile_image_url,
      ),
      profile_image_local: mergeValues(
        newItem.author?.profile_image_local,
        oldItem.author?.profile_image_local || oldItem.profile_image_local,
      ),
    },
    content: {
      ...(oldItem.content || {}),
      ...(newItem.content || {}),
      text: mergeValues(
        newItem.content?.text,
        oldItem.content?.text || oldItem.text,
      ),
    },
    stats: {
      reply: mergeValues(
        newItem.stats?.reply,
        oldItem.stats?.reply || oldItem.reply_count,
      ),
      share: mergeValues(
        newItem.stats?.share,
        oldItem.stats?.share || oldItem.repost_count,
      ),
      like: mergeValues(
        newItem.stats?.like,
        oldItem.stats?.like || oldItem.like_count,
      ),
      view: mergeValues(
        newItem.stats?.view,
        oldItem.stats?.view || oldItem.view_count,
      ),
    },
    thread: {
      ...(oldItem.thread || {}),
      ...(newItem.thread || {}),
      has_thread_line: mergeValues(
        newItem.thread?.has_thread_line,
        oldItem.thread?.has_thread_line || oldItem.has_thread_line,
      ),
      thread_line_height: mergeValues(
        newItem.thread?.thread_line_height,
        oldItem.thread?.thread_line_height || oldItem.thread_line_height,
      ),
      thread_line_x: mergeValues(
        newItem.thread?.thread_line_x,
        oldItem.thread?.thread_line_x || oldItem.thread_line_x,
      ),
      child_candidate_index: mergeValues(
        newItem.thread?.child_candidate_index,
        oldItem.thread?.child_candidate_index || oldItem.child_candidate_index,
      ),
      child_candidate_handle: mergeValues(
        newItem.thread?.child_candidate_handle,
        oldItem.thread?.child_candidate_handle ||
          oldItem.child_candidate_handle,
      ),
      child_candidate_url: mergeValues(
        newItem.thread?.child_candidate_url,
        oldItem.thread?.child_candidate_url || oldItem.child_candidate_url,
      ),
      relationship_confidence: mergeValues(
        newItem.thread?.relationship_confidence,
        oldItem.thread?.relationship_confidence ||
          oldItem.relationship_confidence,
      ),
    },
    first_seen_at: oldItem.first_seen_at || capturedAt,
    last_seen_at: capturedAt,
    capture_count: previousCaptureCount + 1,
  };
}

function mergeDocuments(oldDocument, newDocument) {
  if (!oldDocument || !Array.isArray(oldDocument.items)) {
    return {
      ...newDocument,
      items: newDocument.items.map((item) => ({
        ...item,
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
  const mergedItems = [];
  const seen = new Set();

  for (const item of newDocument.items) {
    const key = stableItemKey(item);
    const oldItem = oldByKey.get(key);
    const merged = oldItem
      ? mergeItem(oldItem, item, capturedAt)
      : {
          ...item,
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
    mergedItems.push(item);
  }

  return {
    schema_version: newDocument.schema_version,
    source: newDocument.source,
    captured_at: newDocument.captured_at,
    items: mergedItems,
  };
}

module.exports = {
  mergeDocuments,
};
