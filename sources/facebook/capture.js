#!/usr/bin/env node
"use strict";

const {
  ensureTab,
  reloadCurrentTab,
  evalText,
  snapshotText,
  getHtml,
} = require("../../lib/browser");
const { runSourceCapture } = require("../../lib/source-capture");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractFacebookSourceItemId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.facebook.com");
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "l.facebook.com") {
      const redirected = parsed.searchParams.get("u");
      return redirected ? extractFacebookSourceItemId(redirected) : null;
    }

    if (host !== "facebook.com" && !host.endsWith(".facebook.com")) {
      return null;
    }

    const path = parsed.pathname.replace(/\/+$/, "");
    let match = path.match(/\/groups\/[^/]+\/posts\/(\d+)/);
    if (match) return `groups:${match[1]}`;

    match = path.match(/\/reel\/(\d+)/);
    if (match) return `reel:${match[1]}`;

    match = path.match(/\/watch\/?\?v=(\d+)/);
    if (match) return `watch:${match[1]}`;

    match = path.match(/\/videos\/(\d+)/);
    if (match) return `video:${match[1]}`;

    match = path.match(/\/([^/]+)\/posts\/([^/?#]+)/);
    if (match) return `posts:${match[2]}`;

    const photoId = parsed.searchParams.get("fbid");
    if (path === "/photo" && photoId) return `photo:${photoId}`;

    const storyId = parsed.searchParams.get("story_fbid");
    if (path === "/permalink.php" && storyId) return `permalink:${storyId}`;

    return null;
  } catch {
    return null;
  }
}

function scoreFacebookItemQuality(item) {
  const text = String(item?.content?.text || "").trim();
  const author = String(item?.author?.handle || "").trim();
  const sourceItemId = String(item?.source_item_id || "").trim();
  const stats = item?.stats || {};
  const engagementSignals = [
    stats.reply,
    stats.share,
    stats.like,
    stats.view,
  ].filter(Boolean).length;
  let score = 0;

  if (sourceItemId) score += 4;
  if (author) score += 2;
  if (text.length >= 80) score += 3;
  else if (text.length >= 30) score += 1;
  if (engagementSignals > 0) score += 1;
  if (Array.isArray(item?.media) && item.media.length > 0) score += 1;
  if (Array.isArray(item?.cards) && item.cards.length > 0) score += 1;

  if (/people you may know/i.test(text)) score -= 4;
  if (/add friend/i.test(text)) score -= 4;
  if (/suggested for you/i.test(text)) score -= 3;
  if (/create story/i.test(text)) score -= 3;
  if (/write a comment/i.test(text)) score -= 1;
  if (text.length < 20 && !sourceItemId) score -= 2;

  return score;
}

function isFacebookItemWorthKeeping(item) {
  if (!item) return false;
  if (item.source_item_id) return true;
  return scoreFacebookItemQuality(item) >= 4;
}

// Facebook's accessible snapshot is substantially more reliable than broad DOM
// text scraping. The DOM contains obfuscated timestamp/status text that leaks
// into container innerText, while the compact snapshot preserves the visible
// post structure as author heading -> action anchor -> body StaticText -> media
// refs -> engagement buttons.
function parseSnapshotLine(rawLine) {
  const indent = rawLine.match(/^ */)?.[0].length || 0;
  const raw = rawLine.trim();
  if (!raw.startsWith("- ")) return null;
  const ref = raw.match(/\[ref=(e\d+)\]/)?.[1] || null;
  const level =
    Number.parseInt(raw.match(/level=(\d+)/)?.[1] || "", 10) || null;
  const typed = raw.match(/^- ([a-z]+)\s+"([^"]*)"/i);
  if (typed) {
    return {
      indent,
      raw,
      type: typed[1].toLowerCase(),
      label: typed[2],
      ref,
      level,
    };
  }
  const plain = raw.match(/^- ([a-z]+)/i);
  return {
    indent,
    raw,
    type: plain ? plain[1].toLowerCase() : "unknown",
    label: null,
    ref,
    level,
  };
}

function isFacebookStopHeading(line) {
  return (
    line?.type === "heading" &&
    ((line.level === 3 &&
      [
        "Reels",
        "Sponsored",
        "Friend requests",
        "Contacts",
        "Group chats",
      ].includes(line.label)) ||
      line.level === 1)
  );
}

function isAgeLabel(label) {
  return /^\d+\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i.test(
    label || "",
  );
}

function isNoiseStaticText(label) {
  const text = String(label || "").trim();
  if (!text) return true;
  if (text.length <= 1) return true;
  if (
    text === "Facebook" ||
    text === "Reels" ||
    text === "Verified account" ||
    text === "Shared with Public" ||
    /^Shared with /i.test(text) ||
    /^Are you interested in this post/i.test(text)
  ) {
    return true;
  }
  return false;
}

function cleanBodyText(text) {
  return String(text || "")
    .replace(/^["“”]\s*/, "")
    .replace(/\s*["“”]\s*$/, "")
    .trim();
}

function cleanAuthorHeading(label) {
  const text = String(label || "")
    .replace(/\s+Verified account$/i, "")
    .trim();
  const activityPatterns = [
    {
      pattern: /^(.*?)\s+updated (his|her|their) profile picture\.$/i,
      impliedText: "updated profile picture.",
    },
    {
      pattern: /^(.*?)\s+shared a memory\.$/i,
      impliedText: "shared a memory.",
    },
    {
      pattern: /^(.*?)\s+is with\s+.+$/i,
      impliedText: null,
    },
    {
      pattern: /^(.*?)\s+is in\s+.+$/i,
      impliedText: null,
    },
  ];

  for (const activity of activityPatterns) {
    const match = text.match(activity.pattern);
    if (!match) continue;
    return {
      author: match[1].trim(),
      impliedText: activity.impliedText,
    };
  }
  return { author: text, impliedText: null };
}

function extractCardFromLabel(label) {
  const match = String(label || "").match(/^([a-z0-9.-]+\.[a-z]{2,})\s+(.+)$/i);
  if (!match) return null;
  return {
    kind: "external_card",
    href: null,
    domain: match[1].replace(/^www\./, ""),
    title: match[2].trim(),
    description: null,
    text: label,
    image_url: null,
  };
}

function extractImageSrcFromHtml(html) {
  const source = String(html || "");
  const src =
    source.match(/<img[^>]+src="([^"]+)"/i)?.[1] ||
    source.match(/<image[^>]+xlink:href="([^"]+)"/i)?.[1] ||
    null;
  return src ? src.replace(/&amp;/g, "&") : null;
}

function findAuthorImageRef(lines, index, authorName) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor];
    if (!line) continue;
    if (line.type === "heading" && line.level === 4) break;
    if (isFacebookStopHeading(line)) break;
    if (line.type !== "link" || !line.ref) continue;
    const label = String(line.label || "");
    if (
      label === authorName ||
      label === `${authorName}, view story` ||
      label.startsWith(`${authorName}, `) ||
      label.includes(authorName)
    ) {
      return line.ref;
    }
  }
  return null;
}

function parsePostBlock(lines, index) {
  const start = lines[index];
  const authorInfo = cleanAuthorHeading(start.label);
  const authorName = authorInfo.author;
  const item = {
    source: "facebook",
    source_item_id: null,
    index: null,
    url: null,
    author: {
      handle: authorName || null,
      display_name: authorName || null,
      profile_image_url: null,
    },
    content: {
      text: "",
    },
    stats: {
      reply: null,
      share: null,
      like: null,
      view: null,
    },
    media: [],
    cards: [],
    thread: {
      has_thread_line: false,
      thread_line_height: null,
      thread_line_x: null,
      child_candidate_index: null,
      child_candidate_handle: null,
      child_candidate_url: null,
      relationship_confidence: null,
    },
    embedded_links: [],
    _media_refs: [],
    _author_image_ref: findAuthorImageRef(lines, index, authorName),
  };

  const contentParts = [];
  const seenContent = new Set();
  const stack = [];

  if (authorInfo.impliedText) {
    contentParts.push(authorInfo.impliedText);
    seenContent.add(authorInfo.impliedText);
  }

  let end = index + 1;
  for (; end < lines.length; end += 1) {
    const line = lines[end];
    if (!line) continue;
    if (
      line.type === "heading" &&
      line.level === 4 &&
      line.label &&
      line.label !== start.label
    ) {
      break;
    }
    if (isFacebookStopHeading(line)) break;

    while (stack.length > 0 && line.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const buttonAncestor = [...stack]
      .reverse()
      .find((entry) => entry.type === "button");
    const linkAncestor = [...stack]
      .reverse()
      .find((entry) => entry.type === "link");

    if (line.type === "button") {
      stack.push(line);
      continue;
    }

    if (line.type === "statictext") {
      const text = cleanBodyText(line.label);
      if (buttonAncestor) {
        if (!/^\d[\d,.KkMm]*$/.test(text)) {
          stack.push(line);
          continue;
        }
        if (buttonAncestor.label === "Like") item.stats.like = text;
        if (buttonAncestor.label === "Leave a comment") item.stats.reply = text;
        if (/send this to friends|share/i.test(buttonAncestor.label || "")) {
          item.stats.share = text;
        }
        stack.push(line);
        continue;
      }
      if (linkAncestor) {
        stack.push(line);
        continue;
      }
      if (isNoiseStaticText(text)) {
        stack.push(line);
        continue;
      }
      if (!seenContent.has(text)) {
        seenContent.add(text);
        contentParts.push(text);
      }
      stack.push(line);
      continue;
    }

    if (line.type === "link") {
      const label = cleanBodyText(line.label);
      if (
        !label ||
        label === authorName ||
        label === "updated his profile picture." ||
        label === `${authorName}, view story` ||
        label === "See translation" ||
        label === "hide post" ||
        isAgeLabel(label)
      ) {
        stack.push(line);
        continue;
      }

      const card = extractCardFromLabel(label);
      if (card) {
        item.cards.push(card);
        stack.push(line);
        continue;
      }

      if (
        label === "No photo description available." ||
        label === "May be pop art" ||
        label === "Es ļoti mīlu māksliniekus"
      ) {
        if (line.ref) item._media_refs.push({ ref: line.ref, alt: label });
        stack.push(line);
        continue;
      }

      stack.push(line);
      continue;
    }
  }

  item.content.text = contentParts.join("\n").trim();
  return { item, nextIndex: end - 1 };
}

function parseSnapshotDocument(snapshot, limit) {
  const lines = String(snapshot || "")
    .split("\n")
    .map((line) => parseSnapshotLine(line))
    .filter(Boolean);

  const feedStart = lines.findIndex(
    (line) =>
      line.type === "heading" &&
      line.level === 3 &&
      line.label === "Feed posts",
  );
  if (feedStart < 0) {
    return {
      schema_version: 1,
      source: "facebook",
      captured_at: new Date().toISOString(),
      items: [],
    };
  }

  const items = [];
  for (
    let index = feedStart + 1;
    index < lines.length && items.length < limit;
    index += 1
  ) {
    const line = lines[index];
    if (!line) continue;
    if (isFacebookStopHeading(line) && line.label !== "Reels") break;
    if (line.type !== "heading" || line.level !== 4) continue;
    const { item, nextIndex } = parsePostBlock(lines, index);
    if (item.author.handle && item.content.text) {
      item.index = items.length + 1;
      items.push(item);
    }
    index = Math.max(index, nextIndex);
  }

  return {
    schema_version: 1,
    source: "facebook",
    captured_at: new Date().toISOString(),
    items,
  };
}

function enrichFacebookItem(item) {
  const media = [];
  for (const ref of item._media_refs || []) {
    try {
      const html = getHtml(`@${ref.ref}`);
      const src = extractImageSrcFromHtml(html);
      if (!src) continue;
      media.push({
        src,
        href: null,
        alt: ref.alt || null,
        media_kind: "image",
      });
    } catch {}
  }

  let profileImageUrl = item.author?.profile_image_url || null;
  if (item._author_image_ref) {
    try {
      const html = getHtml(`@${item._author_image_ref}`);
      profileImageUrl = extractImageSrcFromHtml(html) || profileImageUrl;
    } catch {}
  }

  return {
    ...item,
    author: {
      ...(item.author || {}),
      profile_image_url: profileImageUrl,
    },
    media,
    _author_image_ref: undefined,
    _media_refs: undefined,
  };
}

async function captureDocument({ limit = 12 }) {
  ensureTab("https://www.facebook.com/", "https://www.facebook.com/");
  reloadCurrentTab();
  await sleep(5000);
  evalText(`(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return JSON.stringify({ ok: true });
  })()`);
  await sleep(3000);

  const collectedItems = [];
  const seen = new Set();

  function mergeBatch(snapshot) {
    const document = parseSnapshotDocument(snapshot, limit * 2);
    for (const rawItem of document.items || []) {
      const item = enrichFacebookItem(rawItem);
      if (!isFacebookItemWorthKeeping(item)) continue;
      const key =
        item.source_item_id ||
        item.url ||
        `${item.author?.handle || ""}\n${item.content?.text || ""}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collectedItems.push(item);
    }
  }

  mergeBatch(snapshotText(["-c"]));

  const scrollPasses = Math.max(3, Math.min(8, limit));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 2;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    evalText(`(() => {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
      return JSON.stringify({ ok: true, y: window.scrollY });
    })()`);
    await sleep(1800);
    mergeBatch(snapshotText(["-c"]));
    stagnantPasses =
      collectedItems.length > beforeCount ? 0 : stagnantPasses + 1;
  }

  return {
    schema_version: 1,
    source: "facebook",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
}

const facebookSource = {
  name: "facebook",
  captureDocument,
};

async function captureFacebook(options) {
  return runSourceCapture(facebookSource, options);
}

module.exports = {
  captureFacebook,
  extractFacebookSourceItemId,
  isFacebookItemWorthKeeping,
  scoreFacebookItemQuality,
};
