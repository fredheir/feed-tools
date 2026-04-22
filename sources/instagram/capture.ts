#!/usr/bin/env node
"use strict";

const { buildBrowserRuntimeScript } = require("../browser-runtime/core");
const {
  assertAuthenticatedCapture,
  assertFeedUrlAccessible,
  collectUniqueItems,
} = require("../../lib/source-capture");
import { createBrowserSession, jitterTimeout } from "../../lib/browser.js";
const {
  extractInstagramSourceItemId,
  isInstagramPermalinkUrl,
  isInstagramProfileUrl,
  isInstagramItemWorthKeeping,
} = require("./parse");
import type {
  BrowserSession,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
} from "../../lib/types.js";

function normalizeInstagramCandidate(item: FeedItem): FeedItem {
  return {
    ...item,
    source_item_id:
      extractInstagramSourceItemId(item?.url) || item?.source_item_id,
  };
}

const instagramIsPermalink = isInstagramPermalinkUrl;
const instagramIsProfile = isInstagramProfileUrl;

function instagramIsCountLike(value: unknown): boolean {
  return /^\d[\d,.KkMm]*$/.test(
    String(value || "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function instagramIsTimeLike(value: unknown): boolean {
  return /^\d+[smhdwy]$/i.test(
    String(value || "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function instagramIsNoiseLine(value: unknown): boolean {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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
    instagramIsTimeLike(text)
  );
}

function buildExtractionScript(limit: number): string {
  return buildBrowserRuntimeScript(
    limit,
    `
    function getPermalink(root) {
      const links = Array.from(root.querySelectorAll("a[href]"));
      return links
        .map((link) => makeAbsoluteUrl(link.getAttribute("href"), "https://www.instagram.com"))
        .find((href) => href && instagramIsPermalink(href)) || null;
    }

    function getAuthorLink(root, permalinkUrl) {
      const links = Array.from(root.querySelectorAll("a[href]"));
      return links
        .map((link) => ({
          href: makeAbsoluteUrl(link.getAttribute("href"), "https://www.instagram.com"),
          text: textOf(link),
        }))
        .find((link) => link.href && link.href !== permalinkUrl && instagramIsProfile(link.href) && link.text) || null;
    }

    function getProfileImageUrl(root, authorName) {
      const images = Array.from(root.querySelectorAll("img[src]"));
      const profileMatch = images.find((img) => {
        const alt = String(img.getAttribute("alt") || "").replace(/\\s+/g, " ").trim();
        return /profile picture$/i.test(alt) || (authorName && alt.includes(authorName));
      });
      return profileMatch?.currentSrc || profileMatch?.src || null;
    }

    function getLargeMedia(root, profileImageUrl) {
      const allMedia = Array.from(root.querySelectorAll("img[src], video"));
      const videos = allMedia.filter((node) => node.tagName === "VIDEO");
      const largeImages = allMedia
        .filter((node) => node.tagName === "IMG")
        .map((img) => ({
          src: img.currentSrc || img.src || null,
          alt: String(img.getAttribute("alt") || "").trim() || null,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
        }))
        .filter((img) => img.src && img.src !== profileImageUrl && img.width >= 300 && img.height >= 300);

      if (videos.length > 0) {
        const video = videos[0];
        const poster = video.poster || largeImages[0]?.src || null;
        return [{
          src: poster,
          href: null,
          alt: largeImages[0]?.alt || null,
          media_kind: "video",
          width: video.videoWidth || largeImages[0]?.width || null,
          height: video.videoHeight || largeImages[0]?.height || null,
        }];
      }

      const seen = new Set();
      return largeImages
        .filter((img) => {
          if (!img.src || seen.has(img.src)) return false;
          seen.add(img.src);
          return true;
        })
        .map((img) => ({
          src: img.src,
          href: null,
          alt: img.alt,
          media_kind: "image",
          width: img.width,
          height: img.height,
        }));
    }

    function getEmbeddedLinks(root, permalinkUrl, authorHref) {
      const links = Array.from(root.querySelectorAll("a[href]"));
      const seen = new Set();
      return links
        .map((link) => ({
          href: makeAbsoluteUrl(link.getAttribute("href"), "https://www.instagram.com"),
          text: textOf(link),
        }))
        .filter((link) => {
          if (!link.href || seen.has(link.href)) return false;
          if (link.href === permalinkUrl || link.href === authorHref) return false;
          if (instagramIsPermalink(link.href)) return false;
          seen.add(link.href);
          return true;
        })
        .map((link) => ({
          href: link.href,
          text: link.text || null,
          kind: /\\/reels\\/audio\\//.test(link.href) || /\\/explore\\/locations\\//.test(link.href) ? "entity" : "link",
        }));
    }

    function getStatsAndCaption(root, authorText) {
      const lines = linesOf(root);
      const firstAuthorIndex = lines.findIndex((line) => line === authorText);
      const repeatedAuthorIndex = lines.findIndex((line, index) => index > firstAuthorIndex && line === authorText);
      const countBlock = repeatedAuthorIndex > 0
        ? lines.slice(Math.max(0, firstAuthorIndex + 1), repeatedAuthorIndex).filter(instagramIsCountLike)
        : [];
      const captionStart = repeatedAuthorIndex >= 0 ? repeatedAuthorIndex + 1 : 0;
      const captionLines = lines
        .slice(captionStart)
        .filter((line) => !instagramIsNoiseLine(line) && !instagramIsCountLike(line) && line !== authorText);

      return {
        stats: {
          like: countBlock[0] || null,
          reply: countBlock[1] || null,
          share: countBlock[2] || null,
          view: countBlock[3] || null,
        },
        caption: captionLines.join("\\n").trim(),
      };
    }

    const items = Array.from(document.querySelectorAll("main article"))
      .slice(0, limit * 3)
      .map((article, idx) => {
        const permalinkUrl = getPermalink(article);
        const authorLink = getAuthorLink(article, permalinkUrl);
        const authorText = authorLink?.text || null;
        const authorHref = authorLink?.href || null;
        const profileImageUrl = getProfileImageUrl(article, authorText);
        const parsed = getStatsAndCaption(article, authorText);
        const media = getLargeMedia(article, profileImageUrl)
          .map((item) => ({
            ...item,
            href: permalinkUrl,
          }))
          .filter((item) => item.src || (item.media_kind === "video" && permalinkUrl));
        const embeddedLinks = getEmbeddedLinks(article, permalinkUrl, authorHref);

        return {
          source: "instagram",
          source_item_id: null,
          index: idx + 1,
          url: permalinkUrl,
          author: {
            handle: authorText ? "@" + authorText.replace(/^@/, "") : null,
            display_name: null,
            profile_image_url: profileImageUrl,
          },
          content: {
            text: parsed.caption,
          },
          stats: parsed.stats,
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
      })
      .filter((item) => item.url || item.content.text || item.media.length > 0);

    return JSON.stringify({
      schema_version: 1,
      source: "instagram",
      captured_at: new Date().toISOString(),
      items,
    });
    `,
    [
      instagramIsPermalink,
      instagramIsProfile,
      instagramIsCountLike,
      instagramIsTimeLike,
      instagramIsNoiseLine,
    ],
  );
}

function prepareInstagramFeed(browser: BrowserSession): void {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1800, 500);
  browser.ensureTab(
    ["https://www.instagram.com/"],
    "https://www.instagram.com/",
  );
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.tryWaitForFunction(
    `(() => {
      const articles = document.querySelectorAll('main article').length;
      const text = document.body?.innerText || "";
      return articles > 0 || text.includes("For you") || text.includes("Following");
    })()`,
    mediumWait,
  );
  assertFeedUrlAccessible(
    { sourceName: "instagram", browser },
    {
      blockedUrlPatterns: [
        /\/accounts\/login/i,
        /\/challenge\//i,
        /\/checkpoint\//i,
      ],
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
  prepareInstagramFeed(browser);

  const collectedItems: FeedItem[] = [];
  const seen = new Set<string>();

  function mergeBatch(document: FeedDocument): void {
    collectUniqueItems(document.items, {
      seen,
      sourceName: "instagram",
      target: collectedItems,
      mapItem: normalizeInstagramCandidate,
      shouldInclude: isInstagramItemWorthKeeping,
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
    const { beforeArticleCount } = browser.evalJson<{
      beforeArticleCount: number;
    }>(`(() => {
      const beforeArticleCount = document.querySelectorAll('main article').length;
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
      return JSON.stringify({ beforeArticleCount });
    })()`);
    browser.tryWaitForFunction(
      `document.querySelectorAll('main article').length > ${Number(beforeArticleCount) || 0}`,
      3000,
    );
    mergeBatch(browser.evalJson(extractionScript));
    stagnantPasses =
      collectedItems.length === beforeCount ? stagnantPasses + 1 : 0;
  }

  const document: FeedDocument = {
    schema_version: 1,
    source: "instagram",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit).map(normalizeInstagramCandidate),
  };

  assertAuthenticatedCapture(
    { sourceName: "instagram", browser, document },
    {
      blockedUrlPatterns: [
        /\/accounts\/login/i,
        /\/challenge\//i,
        /\/checkpoint\//i,
      ],
      blockedTextPatterns: [/\blog in\b/i],
    },
  );

  return document;
}

const source = {
  name: "instagram",
  captureDocument,
};
const prepareFeed = prepareInstagramFeed;

module.exports = {
  normalizeInstagramCandidate,
  source,
  prepareFeed,
};
