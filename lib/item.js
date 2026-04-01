"use strict";

function getItemStableId(item) {
  return (
    item.id ||
    (item.source && item.source_item_id
      ? `${item.source}:${item.source_item_id}`
      : null)
  );
}

function getItemMaskKeys(item) {
  const keys = [];
  if (item.id) keys.push(String(item.id));
  if (item.source_item_id) keys.push(String(item.source_item_id));
  if (item.index != null) keys.push(String(item.index));
  if (item.url) keys.push(String(item.url));
  return keys;
}

function getItemHandle(item) {
  return item.author?.handle || item.handle || "";
}

function getItemText(item) {
  return item.content?.text || item.text || "";
}

function getItemStats(item) {
  const stats = item.stats || {};
  return {
    reply: stats.reply ?? item.reply_count ?? "0",
    share: stats.share ?? item.repost_count ?? "0",
    like: stats.like ?? item.like_count ?? "0",
    view: stats.view ?? item.view_count ?? "0",
  };
}

function getItemThread(item) {
  const thread = item.thread || {};
  return {
    hasThreadLine: thread.has_thread_line ?? item.has_thread_line ?? false,
    lineHeight: thread.thread_line_height ?? item.thread_line_height ?? null,
    childCandidateHandle:
      thread.child_candidate_handle ?? item.child_candidate_handle ?? null,
    childCandidateIndex:
      thread.child_candidate_index ?? item.child_candidate_index ?? null,
  };
}

function getItemMedia(item) {
  return item.media || item.embedded_media || [];
}

function getItemCards(item) {
  return item.cards || item.preview_cards || [];
}

function getItemProfileImage(item) {
  return (
    item.author?.profile_image_local ||
    item.profile_image_local ||
    item.author?.profile_image_url ||
    item.profile_image_url ||
    ""
  );
}

module.exports = {
  getItemStableId,
  getItemMaskKeys,
  getItemHandle,
  getItemText,
  getItemStats,
  getItemThread,
  getItemMedia,
  getItemCards,
  getItemProfileImage,
};
