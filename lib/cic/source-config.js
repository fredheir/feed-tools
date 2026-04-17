"use strict";

/**
 * Declarative per-source configuration for Claude in Chrome (CiC) capture.
 *
 * Each source defines the navigation target, ready-check expressions,
 * scroll strategy, and authentication-blocked patterns.  The agent uses
 * this metadata to drive the browser via MCP tools instead of CDP.
 */

const SCROLL_TOP_SCRIPT = `window.scrollTo({ top: 0, behavior: "instant" })`;
const SCROLL_DOWN_WINDOW = `window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" })`;

const SOURCE_CONFIGS = {
  x: {
    url: "https://x.com/home",
    urlPrefixes: ["https://x.com/", "https://twitter.com/"],
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const n = document.querySelectorAll('article').length;
        const t = document.body?.innerText || "";
        return n > 0 || t.includes("For you") || t.includes("Following");
      })()`,
      `(() => {
        const articles = Array.from(document.querySelectorAll('article')).slice(0, 6);
        if (articles.length === 0) return false;
        return articles.some(a => {
          const hasText = Boolean(a.querySelector('[data-testid="tweetText"]'));
          const hasAvatar = Boolean(
            a.querySelector('[data-testid="Tweet-User-Avatar"] img[src]') ||
            a.querySelector('img[src*="pbs.twimg.com/profile_images/"]')
          );
          const hasLink = Array.from(a.querySelectorAll('a[href]')).some(l =>
            /\\/status\\/\\d+$/.test(l.href || '') && !/\\/analytics$/.test(l.href || '')
          );
          return hasText && hasAvatar && hasLink;
        });
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: SCROLL_DOWN_WINDOW,
    itemCountExpression: `document.querySelectorAll('article').length`,
    blockedUrlPatterns: ["/i/flow/login"],
    blockedTextPatterns: ["log in", "sign in"],
  },

  bluesky: {
    url: "https://bsky.app/",
    urlPrefixes: ["https://bsky.app/"],
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const n = document.querySelectorAll('[data-testid^="feedItem-by-"]').length;
        const t = document.body?.innerText || "";
        return n > 0 || t.includes("Home") || t.includes("Discover");
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: SCROLL_DOWN_WINDOW,
    itemCountExpression: `document.querySelectorAll('[data-testid^="feedItem-by-"]').length`,
    blockedUrlPatterns: ["/login"],
    blockedTextPatterns: ["sign in", "create account"],
  },

  linkedin: {
    url: "https://www.linkedin.com/feed/",
    urlPrefixes: ["https://www.linkedin.com/feed"],
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const n = document.querySelectorAll('[data-id]').length;
        return n > 0;
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: `(() => {
      const main = document.querySelector('main');
      if (main) main.scrollBy({ top: Math.round(main.clientHeight * 0.9), behavior: "instant" });
      else window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
    })()`,
    itemCountExpression: `document.querySelectorAll('[data-id]').length`,
    blockedUrlPatterns: ["/login", "/authwall"],
    blockedTextPatterns: ["sign in", "join now"],
  },
};

const hasOwnSourceConfig = (sourceName) =>
  Object.prototype.hasOwnProperty.call(SOURCE_CONFIGS, sourceName);

/**
 * Facebook is not supported in CiC mode because its capture adapter uses
 * accessibility-tree snapshots (snapshotText) rather than JS extraction.
 * A dedicated CiC adapter for Facebook would need to use read_page instead.
 */

function getSourceConfig(sourceName) {
  if (!hasOwnSourceConfig(sourceName)) return null;
  return SOURCE_CONFIGS[sourceName];
}

function listCicSources() {
  return Object.keys(SOURCE_CONFIGS);
}

module.exports = { getSourceConfig, listCicSources };
