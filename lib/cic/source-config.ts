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
    blockedUrlPatterns: ["/login", "/authwall"],
    blockedTextPatterns: ["sign in", "join now"],
  },

  instagram: {
    url: "https://www.instagram.com/",
    urlPrefixes: ["https://www.instagram.com/"],
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
    blockedUrlPatterns: ["/accounts/login", "/challenge/", "/checkpoint/"],
    blockedTextPatterns: ["log in"],
  },

  tiktok: {
    url: "https://www.tiktok.com/",
    urlPrefixes: ["https://www.tiktok.com/"],
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
    blockedUrlPatterns: ["/login", "captcha"],
    blockedTextPatterns: ["log in", "captcha"],
  },

  youtube: {
    url: "https://www.youtube.com/",
    urlPrefixes: ["https://www.youtube.com/"],
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
    blockedUrlPatterns: ["consent", "sorry"],
    blockedTextPatterns: ["Turn on history", "Make YouTube your own"],
  },

  facebook: {
    url: "https://www.facebook.com/",
    urlPrefixes: ["https://www.facebook.com/", "https://m.facebook.com/"],
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
    blockedUrlPatterns: ["/login", "/checkpoint"],
    blockedTextPatterns: [
      "log in to facebook",
      "forgotten password",
      "forgot password",
    ],
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
