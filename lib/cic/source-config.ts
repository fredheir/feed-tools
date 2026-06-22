/**
 * Declarative per-source configuration for Claude in Chrome (CiC) capture.
 *
 * Each source defines the navigation target, ready-check expressions,
 * scroll strategy, and authentication-blocked patterns.  The agent uses
 * this metadata to drive the browser via MCP tools instead of CDP.
 */

import {
  SOURCE_ACCESS_POLICIES,
  SOURCE_SIGNIN_TARGETS,
  type FeedSourceName,
} from "../source-metadata.ts";

const SCROLL_TOP_SCRIPT = `window.scrollTo({ top: 0, behavior: "instant" })`;
const SCROLL_DOWN_WINDOW = `window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" })`;

function sourceAccess(sourceName: FeedSourceName): {
  url: string;
  urlPrefixes: string[];
  blockedUrlPatterns: string[];
  blockedTextPatterns: string[];
} {
  return {
    url: SOURCE_SIGNIN_TARGETS[sourceName].url,
    urlPrefixes: SOURCE_ACCESS_POLICIES[sourceName].urlPrefixes,
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES[sourceName].blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES[sourceName].blockedTextPatterns,
  };
}

const SOURCE_CONFIGS = {
  x: {
    ...sourceAccess("x"),
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
  },

  bluesky: {
    ...sourceAccess("bluesky"),
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
  },

  linkedin: {
    ...sourceAccess("linkedin"),
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const text = document.querySelector('main')?.innerText || '';
        return text.includes('Feed post') || text.includes('Promoted') || text.length > 1000;
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: `(() => {
      const main = document.querySelector('main');
      if (main) main.scrollBy({ top: Math.round(main.clientHeight * 0.9), behavior: "instant" });
      else window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
    })()`,
    itemCountExpression: `(document.querySelector('main')?.innerText.match(/Feed post/g) || []).length`,
  },

  instagram: {
    ...sourceAccess("instagram"),
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const articles = document.querySelectorAll('main article').length;
        const t = document.body?.innerText || "";
        return articles > 0 || t.includes("For you") || t.includes("Following");
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: SCROLL_DOWN_WINDOW,
    itemCountExpression: `document.querySelectorAll('main article').length`,
  },

  tiktok: {
    ...sourceAccess("tiktok"),
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const articles = document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length;
        const videos = document.querySelectorAll('video').length;
        const t = document.body?.innerText || "";
        return articles > 0 || videos > 0 || t.includes("For You");
      })()`,
      `(() => {
        const items = window.__$UNIVERSAL_DATA$__?.__DEFAULT_SCOPE__?.["webapp.updated-items"];
        return Array.isArray(items) && items.length > 0;
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: SCROLL_DOWN_WINDOW,
    itemCountExpression: `document.querySelectorAll('article[data-e2e="recommend-list-item-container"]').length`,
  },

  youtube: {
    ...sourceAccess("youtube"),
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const hasFeedTabs = document.querySelectorAll('[role="tab"]').length > 0;
        const hasVideoCards = document.querySelectorAll('div.ytLockupViewModelHost').length > 0;
        const hasShortsCards = document.querySelectorAll('ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2').length > 0;
        return hasFeedTabs && (hasVideoCards || hasShortsCards);
      })()`,
      `(() => {
        const text = document.body?.innerText || "";
        return !text.includes("Turn on history") && !text.includes("Leave history off");
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: `window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: "instant" })`,
    itemCountExpression: `document.querySelectorAll('div.ytLockupViewModelHost, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2').length`,
  },

  facebook: {
    ...sourceAccess("facebook"),
    readyChecks: [
      "document.readyState === 'complete'",
      `(() => {
        const articles = document.querySelectorAll('[role="article"]').length;
        const t = document.body?.innerText || "";
        return articles > 0 || t.includes("What's on your mind") || t.includes("Stories");
      })()`,
    ],
    scrollTopScript: SCROLL_TOP_SCRIPT,
    scrollDownScript: SCROLL_DOWN_WINDOW,
    itemCountExpression: `document.querySelectorAll('[role="article"]').length`,
  },
} as const;

type CicSourceName = keyof typeof SOURCE_CONFIGS;
type CicSourceConfig = (typeof SOURCE_CONFIGS)[CicSourceName];

const hasOwnSourceConfig = (sourceName: string): sourceName is CicSourceName =>
  Object.prototype.hasOwnProperty.call(SOURCE_CONFIGS, sourceName);

/**
 * Facebook now has a CiC-compatible adapter that reads the rendered DOM
 * directly (see sources/facebook/capture.ts buildExtractionScript).  The
 * legacy accessibility-tree path remains the default for the regular
 * (non-CiC) capture flow.
 */

function getSourceConfig(sourceName: string): CicSourceConfig | null {
  if (!hasOwnSourceConfig(sourceName)) return null;
  return SOURCE_CONFIGS[sourceName];
}

function listCicSources(): CicSourceName[] {
  return Object.keys(SOURCE_CONFIGS) as CicSourceName[];
}

export { getSourceConfig, listCicSources };
