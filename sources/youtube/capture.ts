#!/usr/bin/env node
"use strict";

const { buildBrowserRuntimeScript } = require("../browser-runtime/core.js");
const {
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  collectUniqueItems,
} = require("../../lib/source-capture.js");
import { createBrowserSession, jitterTimeout } from "../../lib/browser.js";
import { isPlainObject, normalizeItemShape } from "../../lib/item-shape.js";
import type {
  BrowserSession,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
} from "../../lib/types.js";

type RawYouTubeCard = {
  kind?: "video" | "short";
  url?: string | null;
  title?: string | null;
  authorName?: string | null;
  authorUrl?: string | null;
  viewText?: string | null;
  publishedText?: string | null;
  durationText?: string | null;
  thumbnailUrl?: string | null;
  profileImageUrl?: string | null;
  sponsored?: boolean | null;
};

type RawYouTubeExtractionPayload = {
  captured_at?: string | null;
  cards: RawYouTubeCard[];
};

function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.youtube.com");
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.replace(/^\/+/, "").split("/")[0] || null;
    }
    const watchId = parsed.searchParams.get("v");
    if (watchId) return watchId;
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) return shortsMatch[1] || null;
    return null;
  } catch {
    return null;
  }
}

function parseDurationSeconds(value: string | null | undefined): number | null {
  const text = String(value || "").trim();
  if (!text || /live/i.test(text)) return null;
  const parts = text
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  if (parts.length === 0) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function cleanText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeYouTubeCardsToItems(
  cards: RawYouTubeCard[],
  limit: number,
): FeedItem[] {
  return cards
    .filter((card) => cleanText(card?.title) && cleanText(card?.url))
    .slice(0, limit)
    .map((card, idx) =>
      normalizeItemShape(
        {
          source: "youtube",
          source_item_id: extractYouTubeVideoId(card.url),
          index: idx + 1,
          url: card.url,
          author: {
            handle: cleanText(card.authorName) || null,
            display_name: cleanText(card.authorName) || null,
            profile_image_url: cleanText(card.profileImageUrl) || null,
            profile_image_local: null,
          },
          content: {
            text: `${card.sponsored ? "[Sponsored] " : ""}${cleanText(card.title)}`,
          },
          stats: {
            reply: null,
            share: null,
            like: null,
            view: cleanText(card.viewText) || null,
          },
          media: [
            {
              src: cleanText(card.thumbnailUrl) || null,
              href: cleanText(card.url) || null,
              alt: cleanText(card.title) || null,
              media_kind: "video",
              duration: parseDurationSeconds(card.durationText),
              source: "youtube",
            },
          ].filter((media) => media.src || media.href),
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
          embedded_links: (() => {
            const links: Array<{
              href?: string | null;
              text?: string | null;
              kind?: string | null;
            }> = [];
            if (card.authorUrl) {
              links.push({
                href: cleanText(card.authorUrl),
                text: cleanText(card.authorName) || null,
                kind: "entity",
              });
            }
            return links;
          })(),
        },
        { source: "youtube", index: idx + 1 },
      ),
    );
}

function assertRawYouTubeExtractionPayload(
  payload: unknown,
): asserts payload is RawYouTubeExtractionPayload {
  if (!isPlainObject(payload) || !Array.isArray(payload.cards)) {
    throw new Error("Invalid youtube extraction payload");
  }
}

function normalizeYouTubeExtractionDocument(payload: unknown): FeedDocument {
  assertRawYouTubeExtractionPayload(payload);
  const capturedAt =
    typeof payload.captured_at === "string" && payload.captured_at
      ? payload.captured_at
      : new Date().toISOString();

  return {
    schema_version: 1,
    source: "youtube",
    captured_at: capturedAt,
    items: normalizeYouTubeCardsToItems(payload.cards, payload.cards.length),
  };
}

function buildExtractionScript(limit: number): string {
  return buildBrowserRuntimeScript(
    limit,
    `
    function normalizeText(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }

    function findText(nodes) {
      for (const node of nodes) {
        const text = normalizeText(textOf(node));
        if (text) return text;
      }
      return null;
    }

    function findHref(root, selectors) {
      for (const selector of selectors) {
        const node = root.querySelector(selector);
        const href = makeAbsoluteUrl(node?.getAttribute("href") || node?.href, "https://www.youtube.com");
        if (href) return href;
      }
      return null;
    }

    function findImage(root, selectors) {
      for (const selector of selectors) {
        const node = root.querySelector(selector);
        const src = node?.currentSrc || node?.src || null;
        if (src) return src;
      }
      return null;
    }

    function firstMatch(text, patterns) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return normalizeText(match[1]);
      }
      return null;
    }

    function buildVideoCard(root) {
      const rootText = normalizeText(textOf(root));
      const url = findHref(root, [
        'a.ytLockupMetadataViewModelTitle[href]',
        'a[href*="/watch"]',
      ]);
      const titleNode = root.querySelector('a.ytLockupMetadataViewModelTitle[href]');
      const titleLabel = normalizeText(titleNode?.getAttribute("aria-label"));
      const title = normalizeText(titleNode?.getAttribute("title") || textOf(titleNode));
      if (!url || !title) return null;

      const authorLink = root.querySelector('yt-lockup-metadata-view-model a[href^="/@"]')
        || root.querySelector('yt-lockup-metadata-view-model a[href*="/channel/"]')
        || root.querySelector('yt-lockup-metadata-view-model a[href*="/c/"]');
      const metadataItems = Array.from(
        root.querySelectorAll('yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-text')
      )
        .map((node) => normalizeText(textOf(node)))
        .filter(Boolean);

      const imageLink = root.querySelector('a.ytLockupViewModelContentImage[href]');
      const durationNode = imageLink?.querySelector('[aria-label*="minutes"], [aria-label*="seconds"], [aria-label*="hours"]')
        || root.querySelector('badge-shape span')
        || root.querySelector('yt-thumbnail-overlay-time-status-renderer span');

      const authorImage = findImage(root, [
        '.ytLockupMetadataViewModelAvatar img',
        'yt-avatar-shape img',
      ]);
      const thumbnailUrl = findImage(root, [
        'a.ytLockupViewModelContentImage img',
        'yt-thumbnail-view-model img',
        'img[src*="ytimg.com/vi/"]',
      ]);
      const fallbackViewText =
        firstMatch(rootText, [/(\d[\d.,KMBmkmb]*\s+views?)/i]) || null;
      const fallbackPublishedText =
        firstMatch(
          rootText,
          [/(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)/i],
        ) || null;
      const fallbackDurationText =
        firstMatch(
          titleLabel,
          [/((?:\d+\s+hours?,\s+)?(?:\d+\s+minutes?)(?:,\s+\d+\s+seconds?)?)/i],
        ) || null;

      return {
        kind: "video",
        url,
        title,
        authorName: normalizeText(textOf(authorLink)),
        authorUrl: makeAbsoluteUrl(authorLink?.getAttribute("href") || authorLink?.href, "https://www.youtube.com"),
        viewText: metadataItems[0] || fallbackViewText,
        publishedText: metadataItems[1] || fallbackPublishedText,
        durationText: normalizeText(textOf(durationNode)) || fallbackDurationText,
        thumbnailUrl,
        profileImageUrl: authorImage,
        sponsored: /\\bSponsored\\b/i.test(normalizeText(textOf(root))),
      };
    }

    function buildShortCard(root) {
      const titleLink = root.querySelector('a.shortsLockupViewModelHostOutsideMetadataEndpoint[href*="/shorts/"]');
      const reelLink = root.querySelector('a.reel-item-endpoint[href*="/shorts/"]');
      const url = makeAbsoluteUrl(
        titleLink?.getAttribute("href") || reelLink?.getAttribute("href") || titleLink?.href || reelLink?.href,
        "https://www.youtube.com",
      );
      const title = normalizeText(
        titleLink?.getAttribute("title") || textOf(titleLink),
      );
      if (!url || !title) return null;

      const thumbnailUrl = findImage(root, [
        'yt-thumbnail-view-model img',
        'img',
        'img[src*="ytimg.com/vi/"]',
      ]);
      const viewText = normalizeText(
        textOf(
          root.querySelector('.shortsLockupViewModelHostOutsideMetadataSubhead')
            || root.querySelector('.shortsLockupViewModelHostMetadataSubhead')
            || root.querySelector('#metadata-line span')
        )
      );

      return {
        kind: "short",
        url,
        title,
        authorName: null,
        authorUrl: null,
        viewText,
        publishedText: null,
        durationText: null,
        thumbnailUrl,
        profileImageUrl: null,
        sponsored: false,
      };
    }

    const roots = Array.from(document.querySelectorAll(
      'div.ytLockupViewModelHost, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2'
    ));
    const seen = new Set();
    const cards = [];

    for (const root of roots) {
      const card = root.matches('div.ytLockupViewModelHost')
        ? buildVideoCard(root)
        : buildShortCard(root.matches('ytm-shorts-lockup-view-model') ? root : root.querySelector('ytm-shorts-lockup-view-model') || root);
      if (!card || !card.url || seen.has(card.url)) continue;
      seen.add(card.url);
      cards.push(card);
      if (cards.length >= limit) break;
    }

    return JSON.stringify({
      schema_version: 1,
      source: "youtube",
      captured_at: new Date().toISOString(),
      cards,
    });
    `,
  );
}

function isBlockedYouTubeHome(browser: BrowserSession): boolean {
  const currentUrl = browser.getCurrentUrl() || "";
  const pageText = browser.snapshotText(["-c"], 5000) || "";
  return (
    /consent|sorry/i.test(currentUrl) ||
    /Turn on history|Make YouTube your own/i.test(pageText)
  );
}

function assertYouTubeCaptureReady(
  browser: BrowserSession,
  document: FeedDocument,
): void {
  assertAuthenticatedCapture(
    { sourceName: "youtube", browser, document },
    {
      blockedUrlPatterns: [/consent/i, /sorry/i],
      blockedTextPatterns: [/Turn on history/i, /Make YouTube your own/i],
    },
  );
  if (document.items.length === 0) {
    throw new Error(
      "Capture failed for youtube: no homepage items were extracted",
    );
  }
}

function prepareYouTubeFeed(browser: BrowserSession): void {
  const shortWait = jitterTimeout(1000, 250);
  const mediumWait = jitterTimeout(2500, 750);
  const longWait = jitterTimeout(5000, 1000);
  browser.ensureTab("https://www.youtube.com/", "https://www.youtube.com/");
  if (isBlockedYouTubeHome(browser)) {
    for (const tab of browser.listTabs()) {
      if (!String(tab.url || "").startsWith("https://www.youtube.com/")) {
        continue;
      }
      browser.switchToTab(tab.index);
      browser.tryWaitForFunction(
        "document.readyState === 'complete'",
        shortWait,
      );
      if (!isBlockedYouTubeHome(browser)) break;
    }
  }
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.tryWaitForFunction(
    `(() => {
      const hasFeedTabs = document.querySelectorAll('[role="tab"]').length > 0;
      const hasVideoCards = document.querySelectorAll('div.ytLockupViewModelHost').length > 0;
      const hasShortsCards = document.querySelectorAll('ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2').length > 0;
      return hasFeedTabs && (hasVideoCards || hasShortsCards);
    })()`,
    mediumWait,
  );
  browser.tryWaitForFunction(
    `(() => {
      const text = document.body?.innerText || "";
      return !text.includes("Turn on history") && !text.includes("Leave history off");
    })()`,
    longWait,
  );
  assertFeedPageAccessible(
    { sourceName: "youtube", browser },
    {
      blockedUrlPatterns: [/consent/i, /sorry/i],
      blockedTextPatterns: [/Turn on history/i, /Make YouTube your own/i],
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
  prepareYouTubeFeed(browser);

  const collectedItems: FeedItem[] = [];
  const seen = new Set<string>();
  const extractionScript = buildExtractionScript(limit);

  function mergeBatch(document: FeedDocument): void {
    collectUniqueItems(document.items, {
      seen,
      sourceName: "youtube",
      target: collectedItems,
    });
  }

  mergeBatch(
    normalizeYouTubeExtractionDocument(browser.evalJson(extractionScript)),
  );

  const scrollPasses = Math.max(2, Math.min(6, limit));
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit;
    index += 1
  ) {
    browser.evalText(`(() => {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: "instant" });
      return JSON.stringify({ ok: true, y: window.scrollY });
    })()`);
    browser.tryWaitForFunction(
      `(() => document.querySelectorAll('div.ytLockupViewModelHost, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2').length > ${collectedItems.length})()`,
      2500,
    );
    mergeBatch(
      normalizeYouTubeExtractionDocument(browser.evalJson(extractionScript)),
    );
  }

  const document = {
    schema_version: 1,
    source: "youtube",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
  assertYouTubeCaptureReady(browser, document);
  return document;
}

const source = {
  name: "youtube",
  captureDocument,
};

const prepareFeed = prepareYouTubeFeed;

module.exports = {
  buildExtractionScript,
  captureDocument,
  extractYouTubeVideoId,
  assertYouTubeCaptureReady,
  normalizeYouTubeCardsToItems,
  normalizeYouTubeExtractionDocument,
  prepareFeed,
  source,
};
