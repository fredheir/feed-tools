"use strict";

const RESERVED_PROFILE_SEGMENTS = new Set([
  "",
  "accounts",
  "about",
  "api",
  "developer",
  "direct",
  "explore",
  "legal",
  "reels",
  "stories",
  "web",
]);

function extractInstagramSourceItemId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.instagram.com");
    const match = parsed.pathname.match(/^\/(p|reel|tv)\/([^/?#]+)\/?$/);
    return match ? `${match[1]}:${match[2]}` : null;
  } catch {
    return null;
  }
}

function isInstagramPermalinkUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://www.instagram.com");
    return /^\/(p|reel|tv)\/[^/?#]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isInstagramProfileUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://www.instagram.com");
    if (parsed.hostname && !/instagram\.com$/i.test(parsed.hostname))
      return false;
    const match = parsed.pathname.match(/^\/([^/?#]+)\/?$/);
    if (!match) return false;
    return !RESERVED_PROFILE_SEGMENTS.has(match[1].toLowerCase());
  } catch {
    return false;
  }
}

function isInstagramItemWorthKeeping(item) {
  if (!item) return false;
  if (!item.url || !item.source_item_id) {
    return false;
  }
  return true;
}

module.exports = {
  extractInstagramSourceItemId,
  isInstagramItemWorthKeeping,
  isInstagramPermalinkUrl,
  isInstagramProfileUrl,
};
