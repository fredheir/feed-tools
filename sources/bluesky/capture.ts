#!/usr/bin/env node
import { buildBrowserRuntimeScript } from "../browser-runtime/core.ts";
import {
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  collectUniqueItems,
} from "../../lib/source-capture.ts";
import { createBrowserSession, jitterTimeout } from "../../lib/browser.ts";
import { isPlainObject, normalizeItemShape } from "../../lib/item-shape.ts";
import type {
  BrowserSession,
  CaptureAdapter,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
} from "../../lib/types.ts";

type RawBlueskyExtractionItem = Parameters<typeof normalizeItemShape>[0];

type RawBlueskyExtractionPayload = {
  captured_at?: string | null;
  items: RawBlueskyExtractionItem[];
};

type BlueskyFeedState = {
  url: string;
  feedItems: number;
  text: string;
};

function assertRawBlueskyExtractionPayload(
  payload: unknown,
): asserts payload is RawBlueskyExtractionPayload {
  if (!isPlainObject(payload) || !Array.isArray(payload.items)) {
    throw new Error("Invalid bluesky extraction payload");
  }
}

function normalizeBlueskyExtractionDocument(payload: unknown): FeedDocument {
  assertRawBlueskyExtractionPayload(payload);
  const capturedAt =
    typeof payload.captured_at === "string" && payload.captured_at
      ? payload.captured_at
      : new Date().toISOString();

  return {
    schema_version: 1,
    source: "bluesky",
    captured_at: capturedAt,
    items: payload.items.map((item, index) =>
      normalizeItemShape(item, { source: "bluesky", index: index + 1 }),
    ),
  };
}

function parseBlueskyFeedState(state: unknown): BlueskyFeedState {
  if (!isPlainObject(state)) {
    throw new Error("Invalid bluesky feed state");
  }
  if (
    typeof state.url !== "string" ||
    typeof state.feedItems !== "number" ||
    !Number.isFinite(state.feedItems) ||
    typeof state.text !== "string"
  ) {
    throw new Error("Invalid bluesky feed state");
  }
  return {
    url: state.url,
    feedItems: state.feedItems,
    text: state.text,
  };
}

function parseDomCount(state: unknown): { count: number } {
  if (!isPlainObject(state)) {
    throw new Error("Invalid bluesky DOM count");
  }
  if (typeof state.count !== "number" || !Number.isFinite(state.count)) {
    throw new Error("Invalid bluesky DOM count");
  }
  return {
    count: state.count,
  };
}

function extractBlueskySourceItemId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://bsky.app");
    const match = parsed.pathname.match(/\/profile\/([^/]+)\/post\/([^/?#]+)/);
    if (!match) return null;
    return `${match[1]}/post/${match[2]}`;
  } catch {
    return null;
  }
}

function buildExtractionScript(limit: number): string {
  return buildBrowserRuntimeScript(
    limit,
    `
    function getPostUrl(item) {
      return (
        Array.from(item.querySelectorAll('a[href]'))
          .map((link) => link.href || "")
          .find((href) => /\\/profile\\/[^/]+\\/post\\/[^/?#]+/.test(href)) ||
        null
      );
    }

    function getStat(item, testId) {
      const button = item.querySelector('[data-testid="' + testId + '"]');
      const text = textOf(button);
      return text || null;
    }

    function getAuthorLinks(item, postUrl) {
      const links = Array.from(item.querySelectorAll('a[href]'));
      const profileLinks = links.filter((link) => {
        const href = link.href || "";
        return /\\/profile\\//.test(href) && href !== postUrl;
      });
      return {
        handleLink:
          profileLinks.find((link) =>
            textOf(link).replace(/\\u202a|\\u202c|\\u2066|\\u2067|\\u2068|\\u2069/g, "").trim().startsWith("@"),
          ) || null,
        displayLink:
          profileLinks.find((link) => {
            const text = textOf(link).replace(/\\u202a|\\u202c|\\u2066|\\u2067|\\u2068|\\u2069/g, "").trim();
            return text && !text.startsWith("@");
          }) || null,
      };
    }

    function getMedia(item, postUrl, avatarUrl) {
      const images = Array.from(item.querySelectorAll('img[src]'));
      const seen = new Set();
      const media = [];
      for (const img of images) {
        const src = img.currentSrc || img.src || "";
        if (!src || src === avatarUrl || seen.has(src)) continue;
        const rect = img.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) continue;
        seen.add(src);
        media.push({
          src,
          href: postUrl,
          alt: img.alt || null,
          media_kind: "image",
        });
      }
      return media;
    }

    function getEmbeddedLinks(item, postUrl) {
      const links = Array.from(item.querySelectorAll('a[href]'));
      const seen = new Set();
      const out = [];
      for (const link of links) {
        const href = link.href || "";
        if (!href || href === postUrl || seen.has(href)) continue;
        if (/\\/profile\\/[^/]+$/.test(href)) continue;
        if (/\\/profile\\/[^/]+\\/post\\//.test(href)) continue;
        seen.add(href);
        out.push({
          href,
          text: textOf(link) || null,
          kind: href.includes("bsky.app") ? "entity" : "link",
        });
      }
      return out;
    }

    function getCards(embeddedLinks) {
      const external = embeddedLinks.find((link) => link.kind === "link");
      if (!external) return [];
      try {
        const url = new URL(external.href);
        return [{
          kind: "external_card",
          href: external.href,
          domain: url.hostname.replace(/^www\\./, ""),
          title: external.text || external.href,
          description: null,
          text: external.text || external.href,
          image_url: null,
        }];
      } catch {
        return [];
      }
    }

    const items = Array.from(document.querySelectorAll('[data-testid^="feedItem-by-"]'))
      .slice(0, limit)
      .map((item, idx) => {
        const postUrl = getPostUrl(item);
        const authorLinks = getAuthorLinks(item, postUrl);
        const handle = textOf(authorLinks.handleLink)
          .replace(/\\u202a|\\u202c|\\u2066|\\u2067|\\u2068|\\u2069/g, "")
          .trim() || null;
        const displayName = textOf(authorLinks.displayLink)
          .replace(/\\u202a|\\u202c|\\u2066|\\u2067|\\u2068|\\u2069/g, "")
          .trim() || null;
        const avatarUrl =
          item.querySelector('[data-testid="userAvatarImage"] img[src]')?.currentSrc ||
          item.querySelector('[data-testid="userAvatarImage"] img[src]')?.src ||
          null;
        const embeddedLinks = getEmbeddedLinks(item, postUrl);
        return {
          source: "bluesky",
          source_item_id: postUrl ? (${extractBlueskySourceItemId.toString()})(postUrl) : null,
          index: idx + 1,
          url: postUrl,
          author: {
            handle,
            display_name: displayName,
            profile_image_url: avatarUrl,
          },
          content: {
            text: multilineTextOf(item.querySelector('[data-testid="postText"]')) || multilineTextOf(item).slice(0, 500),
          },
          stats: {
            reply: getStat(item, "replyBtn"),
            share: getStat(item, "repostBtn"),
            like: getStat(item, "likeBtn"),
            view: null,
          },
          media: getMedia(item, postUrl, avatarUrl),
          cards: getCards(embeddedLinks),
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
      })
      .filter((item) => item.url || item.content.text);

    return JSON.stringify({
      schema_version: 1,
      source: "bluesky",
      captured_at: new Date().toISOString(),
      items,
    });
    `,
  );
}

function prepareBlueskyFeed(browser: BrowserSession): void {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1600, 500);
  browser.ensureTab("https://bsky.app/", "https://bsky.app/");
  const existingFeedState = parseBlueskyFeedState(
    browser.evalJson(`(() => JSON.stringify({
    url: location.href,
    feedItems: document.querySelectorAll('[data-testid^="feedItem-by-"]').length,
    text: document.body?.innerText || ""
  }))()`),
  );
  if (
    String(existingFeedState.url || "").startsWith("https://bsky.app/") &&
    Number(existingFeedState.feedItems || 0) > 0
  ) {
    return;
  }
  browser.reloadCurrentTab();
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.tryWaitForFunction(
    `(() => {
      const feedItems = document.querySelectorAll('[data-testid^="feedItem-by-"]').length;
      const text = document.body?.innerText || "";
      return feedItems > 0 || text.includes("Home") || text.includes("Discover");
    })()`,
    mediumWait,
  );
  assertFeedPageAccessible(
    { sourceName: "bluesky", browser },
    {
      blockedUrlPatterns: [/\/login/i],
      blockedTextPatterns: [/\bsign in\b/i, /\bcreate account\b/i],
    },
  );
  browser.evalText(`(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return JSON.stringify({ ok: true });
  })()`);
  browser.tryWaitForFunction(
    `(() => {
      const feedItems = document.querySelectorAll('[data-testid^="feedItem-by-"]').length;
      const text = document.body?.innerText || "";
      return feedItems > 0 || text.includes("Home") || text.includes("Discover");
    })()`,
    jitterTimeout(900, 300),
  );
}

async function captureDocument({
  limit = 12,
  browserOptions = {},
}: {
  limit?: number;
  browserOptions?: FeedBrowserConfig;
}): Promise<FeedDocument> {
  const browser = createBrowserSession(browserOptions);
  prepareBlueskyFeed(browser);

  const collectedItems: FeedItem[] = [];
  const seen = new Set<string>();

  function mergeBatch(payload: unknown): void {
    const document = normalizeBlueskyExtractionDocument(payload);
    collectUniqueItems(document.items, {
      seen,
      sourceName: "bluesky",
      target: collectedItems,
    });
  }

  mergeBatch(browser.evalJson(buildExtractionScript(limit)));
  if (collectedItems.length === 0) {
    prepareBlueskyFeed(browser);
    mergeBatch(browser.evalJson(buildExtractionScript(limit)));
  }

  const scrollPasses = Math.max(4, Math.min(12, limit + 2));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 3;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    const { count: knownDomItems } = parseDomCount(
      browser.evalJson(`(() => JSON.stringify({
      count: document.querySelectorAll('[data-testid^="feedItem-by-"]').length
    }))()`),
    );
    browser.evalText(`(() => {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
      return JSON.stringify({ ok: true, y: window.scrollY });
    })()`);
    try {
      browser.waitForFunction(
        `document.querySelectorAll('[data-testid^="feedItem-by-"]').length > ${knownDomItems}`,
        2500,
      );
    } catch (err) {
      // Timed out waiting for new feed rows; continue scrolling.
      void err;
    }
    mergeBatch(browser.evalJson(buildExtractionScript(limit)));
    stagnantPasses =
      collectedItems.length > beforeCount ? 0 : stagnantPasses + 1;
  }

  const document = {
    schema_version: 1,
    source: "bluesky",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
  assertAuthenticatedCapture(
    { sourceName: "bluesky", browser, document },
    {
      blockedUrlPatterns: [/\/login/i],
      blockedTextPatterns: [/\bsign in\b/i, /\bcreate account\b/i],
    },
  );
  return document;
}

const source = {
  name: "bluesky",
  captureDocument,
} satisfies CaptureAdapter;
const prepareFeed = prepareBlueskyFeed;

export {
  buildExtractionScript,
  normalizeBlueskyExtractionDocument,
  source,
  prepareFeed,
  extractBlueskySourceItemId,
};
