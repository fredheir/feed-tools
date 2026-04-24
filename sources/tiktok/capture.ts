#!/usr/bin/env node
"use strict";

const {
  buildBrowserRuntimeScript,
  normalizeCount,
  makeAbsoluteUrl,
} = require("../browser-runtime/core.js");
const {
  assertFeedUrlAccessible,
  collectUniqueItems,
} = require("../../lib/source-capture.js");
import { createBrowserSession, jitterTimeout } from "../../lib/browser.js";
import type {
  BrowserSession,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
  FeedMedia,
} from "../../lib/types.js";

const TIKTOK_BASE_URL = "https://www.tiktok.com";
interface BrowserElement {
  currentSrc?: string;
  src?: string;
  textContent?: string | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): BrowserElement | null;
  querySelectorAll(selector: string): BrowserElement[];
}

interface BrowserDocument {
  querySelectorAll(selector: string): BrowserElement[];
}

declare const document: BrowserDocument;
declare function textOf(node: BrowserElement | null | undefined): string;

type TikTokUniversalItem = {
  id?: string | number | null;
  desc?: string | null;
  challenges?: Array<{ title?: string | null }> | null;
  music?: { id?: string | number | null; title?: string | null } | null;
  author?: {
    uniqueId?: string | null;
    nickname?: string | null;
    avatarThumb?: string | null;
    avatarMedium?: string | null;
    avatarLarger?: string | null;
  } | null;
  video?: {
    originCover?: string | null;
    cover?: string | null;
    dynamicCover?: string | null;
    downloadAddr?: string | null;
    playAddr?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  } | null;
  stats?: {
    commentCount?: string | number | null;
    shareCount?: string | number | null;
    diggCount?: string | number | null;
    playCount?: string | number | null;
  } | null;
};

function buildTikTokItemsFromUniversalData(
  universalItems: TikTokUniversalItem[],
  limit: number,
): FeedItem[] {
  return universalItems
    .filter((item) => item && item.id && item.author?.uniqueId && item.video)
    .slice(0, limit)
    .map((item: TikTokUniversalItem, idx: number) => {
      const handle = item.author?.uniqueId ? `@${item.author.uniqueId}` : null;
      const postUrl =
        item.author?.uniqueId && item.id
          ? `${TIKTOK_BASE_URL}/@${item.author.uniqueId}/video/${item.id}`
          : null;
      const embeddedLinks = [];
      for (const challenge of Array.isArray(item.challenges)
        ? item.challenges
        : []) {
        if (!challenge?.title) continue;
        embeddedLinks.push({
          href: makeAbsoluteUrl(
            `/tag/${challenge.title.replace(/^#/, "")}`,
            TIKTOK_BASE_URL,
          ),
          text: `#${challenge.title.replace(/^#/, "")}`,
          kind: "entity",
        });
      }
      if (item.music?.id) {
        embeddedLinks.push({
          href: makeAbsoluteUrl(
            `/music/${(item.music.title || "original-sound").replace(/\s+/g, "-").toLowerCase()}-${item.music.id}`,
            TIKTOK_BASE_URL,
          ),
          text: item.music.title || "original sound",
          kind: "entity",
        });
      }
      return {
        source: "tiktok",
        id: null,
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
          profile_image_local: null,
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
            video_src: item.video?.downloadAddr || item.video?.playAddr || null,
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
}

function parseTikTokDomCount(value: string | null | undefined): string | null {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function findTikTokButtonCount(
  buttons: Array<{ text: string; aria: string }>,
  pattern: RegExp,
): string | null {
  return parseTikTokDomCount(
    buttons.find((button) => pattern.test(button.aria))?.text || null,
  );
}

function buildTikTokItemsFromDom(limit: number): FeedItem[] {
  const articles = Array.from<BrowserElement>(
    document.querySelectorAll(
      'article[data-e2e="recommend-list-item-container"]',
    ),
  );
  return articles.slice(0, limit).flatMap((article, idx): FeedItem[] => {
    const authorLink = Array.from<BrowserElement>(
      article.querySelectorAll("a[href]"),
    ).find((link) => {
      const href = String(link.getAttribute("href") || "");
      return /^\/@[^/]+$/.test(href) && Boolean(textOf(link));
    });
    const handleText = textOf(authorLink).replace(/^@/, "").trim();
    if (!handleText) return [];

    const wrapperId =
      article.querySelector('[id^="xgwrapper-"]')?.getAttribute("id") || "";
    const sourceItemId = wrapperId.match(/(\d{12,})$/)?.[1] || null;
    const url =
      sourceItemId && handleText
        ? `${TIKTOK_BASE_URL}/@${handleText}/video/${sourceItemId}`
        : null;
    const cover = Array.from<BrowserElement>(
      article.querySelectorAll("img[src]"),
    )
      .map((img) => ({
        src: img.currentSrc || img.src || null,
        alt: String(img.getAttribute("alt") || "").trim(),
      }))
      .find((img) => img.src && !img.src.startsWith("data:"));
    const embeddedLinks = Array.from<BrowserElement>(
      article.querySelectorAll('a[href*="/tag/"], a[href*="/music/"]'),
    ).map((link) => ({
      href: makeAbsoluteUrl(link.getAttribute("href"), TIKTOK_BASE_URL),
      text: textOf(link) || null,
      kind: "entity",
    }));
    const buttons = Array.from<BrowserElement>(
      article.querySelectorAll("button,[role='button']"),
    ).map((button) => ({
      text: textOf(button),
      aria: String(button.getAttribute("aria-label") || ""),
    }));
    const media: FeedMedia[] = cover?.src
      ? [
          {
            src: cover.src,
            href: url,
            alt: cover.alt || `TikTok video by @${handleText}`,
            media_kind: "video",
          },
        ]
      : [];

    const item: FeedItem = {
      source: "tiktok",
      id: null,
      source_item_id: sourceItemId,
      index: idx + 1,
      url,
      author: {
        handle: `@${handleText}`,
        display_name: handleText,
        profile_image_url: null,
        profile_image_local: null,
      },
      content: {
        text: cover?.alt || "",
      },
      stats: {
        reply: findTikTokButtonCount(buttons, /comments/i),
        share: findTikTokButtonCount(buttons, /shares/i),
        like: findTikTokButtonCount(buttons, /likes/i),
        view: null,
      },
      media,
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
    return item.url || item.content.text || item.media.length > 0 ? [item] : [];
  });
}

export function buildExtractionScript(limit: number): string {
  return buildBrowserRuntimeScript(
    limit,
    `
    const TIKTOK_BASE_URL = ${JSON.stringify(TIKTOK_BASE_URL)};
    const buildTikTokItemsFromUniversalData = ${buildTikTokItemsFromUniversalData.toString()};
    const parseTikTokDomCount = ${parseTikTokDomCount.toString()};
    const findTikTokButtonCount = ${findTikTokButtonCount.toString()};
    const buildTikTokItemsFromDom = ${buildTikTokItemsFromDom.toString()};
    const universalItems = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"] || [];
    const universalItemsOut = buildTikTokItemsFromUniversalData(universalItems, limit);
    const domItems = universalItemsOut.length >= limit ? [] : buildTikTokItemsFromDom(limit);
    const seen = new Set();
    const items = [];
    for (const item of [...universalItemsOut, ...domItems]) {
      const key = item.source_item_id || item.url || item.content?.text;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= limit) break;
    }

    return JSON.stringify({
      schema_version: 1,
      source: "tiktok",
      captured_at: new Date().toISOString(),
      items,
      meta: {
        universal_count: universalItems.length,
        universal_item_count: universalItemsOut.length,
        dom_item_count: domItems.length,
        dom_count: document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length,
      },
    });
    `,
  );
}

function prepareTikTokFeed(browser: BrowserSession): void {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1800, 500);
  const longWait = jitterTimeout(3500, 900);
  browser.ensureUrl("https://www.tiktok.com/");
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

async function captureDocument({
  limit = 12,
  browserOptions = {},
}: {
  limit?: number;
  browserOptions?: FeedBrowserConfig;
}): Promise<FeedDocument> {
  const browser = createBrowserSession(browserOptions);
  prepareTikTokFeed(browser);

  const collectedItems: FeedItem[] = [];
  const seen = new Set<string>();

  function mergeBatch(document: FeedDocument): void {
    collectUniqueItems(document.items, {
      seen,
      sourceName: "tiktok",
      target: collectedItems,
    });
  }

  const extractionScript = buildExtractionScript(limit);
  mergeBatch(browser.evalJson(extractionScript));

  const scrollPasses = Math.max(4, Math.min(12, limit + 2));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 3;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    const beforeMetrics = browser.evalJson<{
      scrollY: number;
      universalCount: number;
      articleCount: number;
    }>(`(() => JSON.stringify({
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
    browser.tryWaitForFunction(
      `(() => {
        const items = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"];
        const universalCount = Array.isArray(items) ? items.length : 0;
        const articleCount = document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length;
        return universalCount > ${Number(beforeMetrics.universalCount) || 0} || articleCount > ${Number(beforeMetrics.articleCount) || 0};
      })()`,
      3000,
    );
    mergeBatch(browser.evalJson(extractionScript));
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
  buildExtractionScript,
  buildTikTokItemsFromUniversalData,
  buildTikTokItemsFromDom,
  source,
  prepareFeed,
};
