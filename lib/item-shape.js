"use strict";

const crypto = require("node:crypto");

/**
 * @typedef {Object} FeedAuthor
 * @property {string|null} handle
 * @property {string|null} display_name
 * @property {string|null} profile_image_url
 * @property {string|null} profile_image_local
 */

/**
 * @typedef {Object} FeedContent
 * @property {string} text
 */

/**
 * @typedef {Object} FeedStats
 * @property {string|number|null} reply
 * @property {string|number|null} share
 * @property {string|number|null} like
 * @property {string|number|null} view
 */

/**
 * @typedef {Object} FeedThread
 * @property {boolean} has_thread_line
 * @property {string|number|null} thread_line_height
 * @property {string|number|null} thread_line_x
 * @property {string|number|null} child_candidate_index
 * @property {string|null} child_candidate_handle
 * @property {string|null} child_candidate_url
 * @property {string|number|null} relationship_confidence
 */

/**
 * @typedef {Object} FeedItem
 * @property {string|null} id
 * @property {string} source
 * @property {string|null} source_item_id
 * @property {number|null} index
 * @property {string|null} url
 * @property {FeedAuthor} author
 * @property {FeedContent} content
 * @property {FeedStats} stats
 * @property {Array<object>} media
 * @property {Array<object>} cards
 * @property {FeedThread} thread
 * @property {Array<object>} embedded_links
 */

/**
 * @typedef {Object} FeedDocument
 * @property {number} schema_version
 * @property {string} source
 * @property {string|null} captured_at
 * @property {FeedItem[]} items
 */

function valueOrNull(value) {
  return value == null || value === "" ? null : value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return isPlainObject(value) ? value : {};
}

function isFallbackItemId(value) {
  return /:(synthetic|row):/.test(String(value || ""));
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

function canonicalizeGenericUrl(value, base) {
  if (!value) return null;
  try {
    const parsed = new URL(value, base);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith("utm_") ||
        key === "fbclid" ||
        key === "ref" ||
        key === "refsrc" ||
        key === "trackingId" ||
        key === "trk" ||
        key === "trkEmail" ||
        key === "midToken"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    if (!parsed.searchParams.toString()) parsed.search = "";
    return parsed.toString();
  } catch {
    return valueOrNull(value);
  }
}

function canonicalizeFacebookUrl(value) {
  const normalized = canonicalizeGenericUrl(value, "https://www.facebook.com");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);

    if (parsed.hostname === "l.facebook.com") {
      const redirected = parsed.searchParams.get("u");
      return redirected ? canonicalizeFacebookUrl(redirected) : null;
    }

    if (parsed.pathname === "/plugins/post.php") {
      const href = parsed.searchParams.get("href");
      return href ? canonicalizeFacebookUrl(href) : null;
    }

    parsed.hostname = "www.facebook.com";
    parsed.hash = "";

    if (parsed.pathname === "/permalink.php") {
      const storyId = parsed.searchParams.get("story_fbid");
      const accountId = parsed.searchParams.get("id");
      parsed.search = "";
      if (storyId) parsed.searchParams.set("story_fbid", storyId);
      if (accountId) parsed.searchParams.set("id", accountId);
      return parsed.toString();
    }

    if (parsed.pathname === "/photo") {
      const photoId = parsed.searchParams.get("fbid");
      parsed.search = "";
      if (photoId) parsed.searchParams.set("fbid", photoId);
      return parsed.toString();
    }

    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith("__") ||
        key === "comment_id" ||
        key === "reply_comment_id" ||
        key === "notif_id"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    if (!parsed.searchParams.toString()) parsed.search = "";

    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function canonicalizeLinkedInUrl(value) {
  const normalized = canonicalizeGenericUrl(value, "https://www.linkedin.com");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    parsed.hostname = "www.linkedin.com";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    if (!parsed.searchParams.toString()) parsed.search = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function canonicalizeInstagramUrl(value) {
  const normalized = canonicalizeGenericUrl(value, "https://www.instagram.com");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    parsed.hostname = "www.instagram.com";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    if (!parsed.searchParams.toString()) parsed.search = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function canonicalizeXUrl(value) {
  const normalized = canonicalizeGenericUrl(value, "https://x.com");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    parsed.hostname = "x.com";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function canonicalizeItemUrl(source, value) {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  if (source === "facebook") return canonicalizeFacebookUrl(normalized);
  if (source === "instagram") return canonicalizeInstagramUrl(normalized);
  if (source === "linkedin") return canonicalizeLinkedInUrl(normalized);
  if (source === "x") return canonicalizeXUrl(normalized);
  return canonicalizeGenericUrl(normalized);
}

function assertFeedDocument(document, context = "operation") {
  if (!isPlainObject(document) || !Array.isArray(document.items)) {
    throw new Error(
      `Expected standardized feed document with .items array in ${context}`,
    );
  }
}

function isGenericIdentityUrl(source, value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (source === "linkedin") {
      return isGenericLinkedInPostsPath(parsed.pathname);
    }
    return false;
  } catch {
    return false;
  }
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
  const url = canonicalizeItemUrl(source, item?.url) || "";
  return [source, authorHandle, contentText, firstLink, firstMedia, url].join(
    "\n",
  );
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

function getPreferredItemKey(item, fallback = {}) {
  const source = item?.source || fallback.source || "unknown";
  const itemId = sanitizeItemId(source, item?.id);
  const sourceItemId = sanitizeSourceItemId(source, item?.source_item_id);
  const url = canonicalizeItemUrl(source, item?.url);

  if (itemId && !isFallbackItemId(itemId)) return itemId;
  if (sourceItemId) return `${source}:${sourceItemId}`;
  if (url && !isGenericIdentityUrl(source, url)) return url;
  if (itemId) return itemId;
  return (
    getSyntheticItemId(item, source, fallback) ||
    `${source}:${item?.index ?? fallback.index ?? "no-index"}`
  );
}

function normalizeItemShape(item, fallback = {}) {
  const source = item?.source || fallback.source || "unknown";
  const sourceItemId = sanitizeSourceItemId(source, item?.source_item_id);
  const author = normalizeObject(item?.author);
  const content = normalizeObject(item?.content);
  const thread = normalizeObject(item?.thread);
  const itemId = sanitizeItemId(source, item?.id);
  const url = canonicalizeItemUrl(source, item?.url);

  return {
    id:
      itemId ||
      (sourceItemId
        ? `${source}:${sourceItemId}`
        : getSyntheticItemId(item, source, fallback)),
    source,
    source_item_id: sourceItemId,
    index: item?.index ?? fallback.index ?? null,
    url,
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
  assertFeedDocument,
  canonicalizeItemUrl,
  getSyntheticItemId,
  getPreferredItemKey,
  isPlainObject,
  normalizeItemShape,
  sanitizeItemId,
  sanitizeSourceItemId,
};
