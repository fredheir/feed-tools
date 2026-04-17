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

function textOrEmpty(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

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

function isCountLike(value) {
  return /^\d[\d,.KkMm]*$/.test(textOrEmpty(value));
}

function isTimeLike(value) {
  return /^\d+[smhdwy]$/i.test(textOrEmpty(value));
}

function isInstagramNoiseLine(value) {
  const text = textOrEmpty(value);
  if (!text) return true;
  return (
    text === "•" ||
    text === "more" ||
    text === "See translation" ||
    text === "Suggested for you" ||
    text === "Follow" ||
    text === "Original audio" ||
    text === "Learn more" ||
    text === "Shop now" ||
    text === "Ad" ||
    isTimeLike(text)
  );
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
