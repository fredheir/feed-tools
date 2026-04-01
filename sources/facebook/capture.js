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
const {
  cleanAuthorHeading,
  cleanBodyText,
  extractCardFromLabel,
  extractFacebookSourceItemId,
  extractImageSrcFromHtml,
  isAgeLabel,
  isFacebookItemWorthKeeping,
  isFacebookStopHeading,
  isNoiseStaticText,
  parseSnapshotLine,
  scoreFacebookItemQuality,
} = require("./parse");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
