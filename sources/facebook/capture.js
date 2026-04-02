#!/usr/bin/env node
"use strict";

const { createBrowserSession, jitterTimeout } = require("../../lib/browser");
const {
  canonicalizeItemUrl,
  getPreferredItemKey,
} = require("../../lib/item-shape");
const { runSourceCapture } = require("../../lib/source-capture");
const {
  cleanAuthorHeading,
  cleanBodyText,
  extractCardFromLabel,
  extractFacebookSourceItemId,
  extractHrefFromHtml,
  extractImageSrcFromHtml,
  isAgeLabel,
  isFacebookPermalinkUrl,
  isFacebookItemWorthKeeping,
  isFacebookStopHeading,
  isNoiseStaticText,
  parseSnapshotLine,
  scoreFacebookItemQuality,
} = require("./parse");

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
    _link_refs: [],
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
      if (line.ref) {
        item._link_refs.push({
          ref: line.ref,
          label,
        });
      }
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

function enrichFacebookItem(item, browser) {
  const media = [];
  const embeddedLinks = [];
  const seenEmbeddedLinks = new Set();
  for (const ref of item._media_refs || []) {
    try {
      const html = browser.getHtml(`@${ref.ref}`);
      const src = extractImageSrcFromHtml(html);
      if (!src) continue;
      media.push({
        src,
        href: null,
        alt: ref.alt || null,
        media_kind: "image",
      });
    } catch (err) {
      // Snapshot ref missing or DOM changed while resolving media.
      void err;
    }
  }

  let profileImageUrl = item.author?.profile_image_url || null;
  if (item._author_image_ref) {
    try {
      const html = browser.getHtml(`@${item._author_image_ref}`);
      profileImageUrl = extractImageSrcFromHtml(html) || profileImageUrl;
    } catch (err) {
      // Author image ref may be stale or missing.
      void err;
    }
  }

  let permalinkUrl = item.url || null;
  let sourceItemId = item.source_item_id || null;
  for (const linkRef of item._link_refs || []) {
    if (!linkRef?.ref) continue;
    try {
      const html = browser.getHtml(`@${linkRef.ref}`);
      const href = canonicalizeItemUrl("facebook", extractHrefFromHtml(html));
      if (!href) continue;

      if (!permalinkUrl && isFacebookPermalinkUrl(href)) {
        permalinkUrl = href;
        sourceItemId = extractFacebookSourceItemId(href) || sourceItemId;
        continue;
      }

      if (isFacebookPermalinkUrl(href)) continue;

      const kind = href.includes("facebook.com") ? "entity" : "link";
      if (seenEmbeddedLinks.has(href)) continue;
      seenEmbeddedLinks.add(href);
      embeddedLinks.push({
        href,
        text: linkRef.label || null,
        kind,
      });
    } catch (err) {
      void err;
    }
  }

  return {
    ...item,
    source_item_id: sourceItemId,
    url: permalinkUrl,
    author: {
      ...(item.author || {}),
      profile_image_url: profileImageUrl,
    },
    embedded_links: embeddedLinks,
    media,
    _author_image_ref: undefined,
    _link_refs: undefined,
    _media_refs: undefined,
  };
}

function captureFacebookSnapshot(browser) {
  try {
    return browser.snapshotText(["-c", "-s", "main"]);
  } catch {
    return browser.snapshotText(["-c"]);
  }
}

function prepareFacebookFeed(browser) {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1600, 500);
  browser.ensureTab("https://www.facebook.com/", "https://www.facebook.com/");
  browser.reloadCurrentTab();
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.evalText(`(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return JSON.stringify({ ok: true });
  })()`);
  browser.tryWaitForFunction(
    `(() => {
      const text = document.body?.innerText || "";
      const feedishText =
        text.includes("Feed posts") ||
        text.includes("What's on your mind") ||
        text.includes("Create story") ||
        text.includes("Reels");
      const feedishDom =
        document.querySelectorAll('[role="feed"], [role="article"], div[aria-posinset]').length > 0;
      return feedishText || feedishDom;
    })()`,
    mediumWait,
  );
}

async function captureDocument({ limit = 12, browserOptions = {} }) {
  const browser = createBrowserSession(browserOptions);
  prepareFacebookFeed(browser);

  const collectedItems = [];
  const seen = new Set();

  function mergeBatch(snapshot) {
    const document = parseSnapshotDocument(snapshot, limit * 2);
    for (const rawItem of document.items || []) {
      const item = enrichFacebookItem(rawItem, browser);
      if (!isFacebookItemWorthKeeping(item)) continue;
      const key = getPreferredItemKey(item, {
        source: "facebook",
        index: item.index,
      });
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collectedItems.push(item);
    }
  }

  mergeBatch(captureFacebookSnapshot(browser));
  if (collectedItems.length === 0) {
    prepareFacebookFeed(browser);
    mergeBatch(captureFacebookSnapshot(browser));
  }

  const scrollPasses = Math.max(3, Math.min(8, limit));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 2;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    const beforeHeight = browser.evalJson(`(() => JSON.stringify({
      scrollHeight: document.scrollingElement?.scrollHeight || document.body?.scrollHeight || 0
    }))()`).scrollHeight;
    browser.evalText(`(() => {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
      return JSON.stringify({ ok: true, y: window.scrollY });
    })()`);
    try {
      browser.waitForFunction(
        `(document.scrollingElement?.scrollHeight || document.body?.scrollHeight || 0) > ${beforeHeight}`,
        2500,
      );
    } catch (err) {
      void err;
    }
    mergeBatch(captureFacebookSnapshot(browser));
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
  prepareFacebookFeed,
  scoreFacebookItemQuality,
};
