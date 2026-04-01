"use strict";

const crypto = require("node:crypto");

function valueOrNull(value) {
  return value == null || value === "" ? null : value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isGenericLinkedInPostsPath(value) {
  return /^\/company\/[^/]+\/posts\/?$/.test(String(value || ""));
}

function isGenericLinkedInPostsId(value) {
  return /^linkedin:\/company\/[^/]+\/posts\/?$/.test(String(value || ""));
}

function sanitizeSourceItemId(source, value) {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  if (source === "linkedin" && isGenericLinkedInPostsPath(normalized)) {
    return null;
  }
  return normalized;
}

function sanitizeItemId(source, value) {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  if (source === "linkedin" && isGenericLinkedInPostsId(normalized)) {
    return null;
  }
  return normalized;
}

function buildSyntheticFingerprint(item, source, fallback = {}) {
  const authorHandle = valueOrNull(item?.author?.handle) || "";
  const contentText =
    valueOrNull(item?.content?.text) || valueOrNull(item?.text) || "";
  const firstLink =
    valueOrNull(item?.embedded_links?.[0]?.href) ||
    valueOrNull(item?.cards?.[0]?.href) ||
    "";
  const firstMedia =
    valueOrNull(item?.media?.[0]?.src) ||
    valueOrNull(item?.media?.[0]?.href) ||
    "";
  const url = valueOrNull(item?.url) || "";
  const rowHint = item?.index ?? fallback.index ?? "";
  return [
    source,
    authorHandle,
    contentText,
    firstLink,
    firstMedia,
    url,
    rowHint,
  ].join("\n");
}

function getSyntheticItemId(item, source, fallback = {}) {
  const fingerprint = buildSyntheticFingerprint(item, source, fallback);
  const hash = crypto
    .createHash("sha1")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 12);
  return `${source}:synthetic:${hash}`;
}

function normalizeItemShape(item, fallback = {}) {
  const source = item?.source || fallback.source || "unknown";
  const sourceItemId = sanitizeSourceItemId(source, item?.source_item_id);
  const author = item?.author || {};
  const content = item?.content || {};
  const thread = item?.thread || {};
  const itemId = sanitizeItemId(source, item?.id);

  return {
    id:
      itemId ||
      (sourceItemId
        ? `${source}:${sourceItemId}`
        : getSyntheticItemId(item, source, fallback)),
    source,
    source_item_id: sourceItemId,
    index: item?.index ?? fallback.index ?? null,
    url: valueOrNull(item?.url),
    author: {
      handle: valueOrNull(author.handle),
      display_name: valueOrNull(author.display_name),
      profile_image_url: valueOrNull(author.profile_image_url),
      profile_image_local: valueOrNull(author.profile_image_local),
    },
    content: {
      text: valueOrNull(content.text) || "",
    },
    stats: {
      reply: valueOrNull(item?.stats?.reply),
      share: valueOrNull(item?.stats?.share),
      like: valueOrNull(item?.stats?.like),
      view: valueOrNull(item?.stats?.view),
    },
    media: normalizeArray(item?.media),
    cards: normalizeArray(item?.cards),
    thread: {
      has_thread_line: Boolean(thread.has_thread_line),
      thread_line_height: valueOrNull(thread.thread_line_height),
      thread_line_x: valueOrNull(thread.thread_line_x),
      child_candidate_index: valueOrNull(thread.child_candidate_index),
      child_candidate_handle: valueOrNull(thread.child_candidate_handle),
      child_candidate_url: valueOrNull(thread.child_candidate_url),
      relationship_confidence: valueOrNull(thread.relationship_confidence),
    },
    embedded_links: normalizeArray(item?.embedded_links),
  };
}

module.exports = {
  getSyntheticItemId,
  normalizeItemShape,
  sanitizeItemId,
  sanitizeSourceItemId,
};
