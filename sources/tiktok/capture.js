#!/usr/bin/env node
"use strict";

const { createBrowserSession, jitterTimeout } = require("../../lib/browser");
const {
  assertFeedUrlAccessible,
  collectUniqueItems,
} = require("../../lib/source-capture");

function buildExtractionScript(limit) {
  return `(() => {
    const limit = ${JSON.stringify(limit)};

    function textOf(node) {
      return (node?.innerText || node?.textContent || "").replace(/\\s+/g, " ").trim();
    }

    function normalizeCount(value) {
      const text = String(value ?? "").replace(/\\s+/g, " ").trim();
      return text || null;
    }

    function makeAbsolute(url) {
      if (!url) return null;
      try {
        return new URL(url, "https://www.tiktok.com").toString();
      } catch {
        return null;
      }
    }

    function getUniversalItems() {
      const items = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"];
      return Array.isArray(items) ? items : [];
    }

    const items = getUniversalItems()
      .filter((item) => item && item.id && item.author?.uniqueId && item.video)
      .slice(0, limit)
      .map((item, idx) => {
        const handle = item.author?.uniqueId ? "@" + item.author.uniqueId : null;
        const postUrl =
          item.author?.uniqueId && item.id
            ? "https://www.tiktok.com/@" + item.author.uniqueId + "/video/" + item.id
            : null;
        const embeddedLinks = [];
        for (const challenge of Array.isArray(item.challenges) ? item.challenges : []) {
          if (!challenge?.title) continue;
          embeddedLinks.push({
            href: makeAbsolute("/tag/" + challenge.title.replace(/^#/, "")),
            text: "#" + challenge.title.replace(/^#/, ""),
            kind: "entity",
          });
        }
        if (item.music?.id) {
          embeddedLinks.push({
            href: makeAbsolute("/music/" + (item.music.title || "original-sound").replace(/\\s+/g, "-").toLowerCase() + "-" + item.music.id),
            text: item.music.title || "original sound",
            kind: "entity",
          });
        }
        return {
          source: "tiktok",
          source_item_id: String(item.id),
          index: idx + 1,
          url: postUrl,
          author: {
            handle,
            display_name: item.author?.nickname || null,
            profile_image_url:
              item.author?.avatarThumb ||
              item.author?.avatarMedium ||
              item.author?.avatarLarger ||
              null,
          },
          content: {
            text: String(item.desc || "").trim(),
          },
          stats: {
            reply: normalizeCount(item.stats?.commentCount),
            share: normalizeCount(item.stats?.shareCount),
            like: normalizeCount(item.stats?.diggCount),
            view: normalizeCount(item.stats?.playCount),
          },
          media: [
            {
              src:
                item.video?.originCover ||
                item.video?.cover ||
                item.video?.dynamicCover ||
                null,
              video_src:
                item.video?.downloadAddr ||
                item.video?.playAddr ||
                null,
              href: postUrl,
              alt: String(item.desc || "").trim() || handle || "TikTok video",
              media_kind: "video",
              width: item.video?.width || null,
              height: item.video?.height || null,
              duration: item.video?.duration || null,
            },
          ].filter((media) => media.src || media.video_src),
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
          embedded_links: embeddedLinks,
        };
      });

    return JSON.stringify({
      schema_version: 1,
      source: "tiktok",
      captured_at: new Date().toISOString(),
      items,
      meta: {
        universal_count: getUniversalItems().length,
        dom_count: document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length,
      },
    });
  })()`;
}

function prepareTikTokFeed(browser) {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1800, 500);
  const longWait = jitterTimeout(3500, 900);
  browser.ensureTab("https://www.tiktok.com/", "https://www.tiktok.com/");
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.tryWaitForFunction(
    `(() => {
      const articles = document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length;
      const videos = document.querySelectorAll('video').length;
      const text = document.body?.innerText || "";
      return articles > 0 || videos > 0 || text.includes("For You");
    })()`,
    mediumWait,
  );
  browser.tryWaitForFunction(
    `(() => {
      const items = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"];
      return Array.isArray(items) && items.length > 0;
    })()`,
    longWait,
  );
  assertFeedUrlAccessible(
    { sourceName: "tiktok", browser },
    {
      blockedUrlPatterns: [/\/login/i, /captcha/i],
    },
  );
  browser.evalText(`(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return JSON.stringify({ ok: true });
  })()`);
}

async function captureDocument({ limit = 12, browserOptions = {} }) {
  const browser = createBrowserSession(browserOptions);
  prepareTikTokFeed(browser);

  const collectedItems = [];
  const seen = new Set();

  function mergeBatch(document) {
    collectUniqueItems(document.items, {
      seen,
      sourceName: "tiktok",
      target: collectedItems,
    });
  }

  mergeBatch(browser.evalJson(buildExtractionScript(limit)));

  const scrollPasses = Math.max(4, Math.min(12, limit + 2));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 3;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    const beforeMetrics = browser.evalJson(`(() => JSON.stringify({
      scrollY: window.scrollY,
      universalCount: Array.isArray(window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"])
        ? window.__$UNIVERSAL_DATA$__.__DEFAULT_SCOPE__["webapp.updated-items"].length
        : 0,
      articleCount: document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length
    }))()`);
    browser.evalText(`(() => {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.92), behavior: "instant" });
      return JSON.stringify({ ok: true, y: window.scrollY });
    })()`);
    try {
      browser.waitForFunction(
        `(() => {
          const items = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"];
          const universalCount = Array.isArray(items) ? items.length : 0;
          const articleCount = document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length;
          return universalCount > ${Number(beforeMetrics.universalCount) || 0} || articleCount > ${Number(beforeMetrics.articleCount) || 0};
        })()`,
        3000,
      );
    } catch (error) {
      void error;
    }
    mergeBatch(browser.evalJson(buildExtractionScript(limit)));
    stagnantPasses =
      collectedItems.length === beforeCount ? stagnantPasses + 1 : 0;
  }

  return {
    schema_version: 1,
    source: "tiktok",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
}

const source = {
  name: "tiktok",
  captureDocument,
};
const prepareFeed = prepareTikTokFeed;

module.exports = {
  source,
  prepareFeed,
};
