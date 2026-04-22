#!/usr/bin/env node
"use strict";

const {
  buildBrowserRuntimeScript,
  normalizeCount,
  makeAbsoluteUrl,
} = require("../browser-runtime/core");
const {
  assertFeedUrlAccessible,
  collectUniqueItems,
} = require("../../lib/source-capture");
import { createBrowserSession, jitterTimeout } from "../../lib/browser.js";
import type {
  BrowserSession,
  FeedDocument,
  FeedItem,
} from "../../lib/types.js";

const TIKTOK_BASE_URL = "https://www.tiktok.com";

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

function buildExtractionScript(limit: number): string {
  return buildBrowserRuntimeScript(
    limit,
    `
    const TIKTOK_BASE_URL = ${JSON.stringify(TIKTOK_BASE_URL)};
    const buildTikTokItemsFromUniversalData = ${buildTikTokItemsFromUniversalData.toString()};
    const universalItems = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"] || [];
    const items = buildTikTokItemsFromUniversalData(universalItems, limit);

    return JSON.stringify({
      schema_version: 1,
      source: "tiktok",
      captured_at: new Date().toISOString(),
      items,
      meta: {
        universal_count: universalItems.length,
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

async function captureDocument({
  limit = 12,
  browserOptions = {},
}: {
  limit?: number;
  browserOptions?: Record<string, unknown>;
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
  buildTikTokItemsFromUniversalData,
  source,
  prepareFeed,
};
