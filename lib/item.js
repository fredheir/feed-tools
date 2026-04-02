"use strict";

function getItemMaskKeys(item) {
  const keys = [];
  if (item.id) keys.push(String(item.id));
  if (item.source_item_id) keys.push(String(item.source_item_id));
  if (item.index != null) keys.push(String(item.index));
  if (item.url) keys.push(String(item.url));
  return keys;
}

function getItemHandle(item) {
  return item.author?.handle || "";
}

function getItemText(item) {
  return item.content?.text || "";
}

function getItemStats(item) {
  const stats = item.stats || {};
  return {
    reply: stats.reply ?? "0",
    share: stats.share ?? "0",
    like: stats.like ?? "0",
    view: stats.view ?? "0",
  };
}

function getItemThread(item) {
  const thread = item.thread || {};
  return {
    hasThreadLine: thread.has_thread_line ?? false,
    lineHeight: thread.thread_line_height ?? null,
    childCandidateHandle: thread.child_candidate_handle ?? null,
    childCandidateIndex: thread.child_candidate_index ?? null,
  };
}

function getItemMedia(item) {
  return item.media || [];
}

function getItemCards(item) {
  return item.cards || [];
}

function getItemProfileImage(item) {
  return (
    item.author?.profile_image_local || item.author?.profile_image_url || ""
  );
}

module.exports = {
  getItemMaskKeys,
  getItemHandle,
  getItemText,
  getItemStats,
  getItemThread,
  getItemMedia,
  getItemCards,
  getItemProfileImage,
};
