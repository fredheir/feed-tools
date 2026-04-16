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

function hasRenderableInstagramMedia(item) {
  return Boolean(
    Array.isArray(item?.media) &&
    item.media.some((media) => media?.src || media?.href || media?.video_src),
  );
}

function scoreInstagramItemQuality(item) {
  const text = textOrEmpty(item?.content?.text);
  const author = textOrEmpty(item?.author?.handle);
  const permalink = textOrEmpty(item?.source_item_id);
  const mediaCount = hasRenderableInstagramMedia(item) ? item.media.length : 0;
  const stats = item?.stats || {};
  const engagementSignals = [
    stats.reply,
    stats.share,
    stats.like,
    stats.view,
  ].filter(Boolean).length;
  let score = 0;

  if (permalink) score += 4;
  if (author) score += 2;
  if (text.length >= 30) score += 3;
  else if (text.length >= 10) score += 1;
  if (mediaCount > 0) score += 2;
  if (engagementSignals > 0) score += 1;
  if (text === "Ad" || text === "Follow") score -= 3;

  return score;
}

function isInstagramItemWorthKeeping(item) {
  if (!item) return false;
  if (!item.source_item_id && !item.url && !hasRenderableInstagramMedia(item)) {
    return false;
  }
  if (item.source_item_id) return true;
  return (
    scoreInstagramItemQuality(item) >= 3 &&
    textOrEmpty(item?.author?.handle) &&
    textOrEmpty(item?.content?.text)
  );
}

module.exports = {
  extractInstagramSourceItemId,
  isInstagramItemWorthKeeping,
  isInstagramPermalinkUrl,
  isInstagramProfileUrl,
};
