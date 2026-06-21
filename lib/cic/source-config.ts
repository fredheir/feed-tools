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
} from "../source-metadata.ts";

const SCROLL_TOP_SCRIPT = `window.scrollTo({ top: 0, behavior: "instant" })`;
const SCROLL_DOWN_WINDOW = `window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" })`;

const SOURCE_CONFIGS = {
  x: {
    url: SOURCE_SIGNIN_TARGETS.x.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.x.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.x.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.x.blockedTextPatterns,
  },

  bluesky: {
    url: SOURCE_SIGNIN_TARGETS.bluesky.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.bluesky.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.bluesky.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.bluesky.blockedTextPatterns,
  },

  linkedin: {
    url: SOURCE_SIGNIN_TARGETS.linkedin.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.linkedin.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.linkedin.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.linkedin.blockedTextPatterns,
  },

  instagram: {
    url: SOURCE_SIGNIN_TARGETS.instagram.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.instagram.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.instagram.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.instagram.blockedTextPatterns,
  },

  tiktok: {
    url: SOURCE_SIGNIN_TARGETS.tiktok.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.tiktok.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.tiktok.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.tiktok.blockedTextPatterns,
  },

  youtube: {
    url: SOURCE_SIGNIN_TARGETS.youtube.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.youtube.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.youtube.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.youtube.blockedTextPatterns,
  },

  facebook: {
    url: SOURCE_SIGNIN_TARGETS.facebook.url,
    urlPrefixes: SOURCE_ACCESS_POLICIES.facebook.urlPrefixes,
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
    blockedUrlPatterns: SOURCE_ACCESS_POLICIES.facebook.blockedUrlPatterns,
    blockedTextPatterns: SOURCE_ACCESS_POLICIES.facebook.blockedTextPatterns,
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
