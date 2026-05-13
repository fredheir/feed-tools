#!/usr/bin/env node
import { buildBrowserRuntimeScript } from "../browser-runtime/core.ts";
import {
  canonicalizeItemUrl,
  isPlainObject,
  normalizeItemShape,
} from "../../lib/item-shape.ts";
import {
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  collectUniqueItems,
} from "../../lib/source-capture.ts";
import { createBrowserSession, jitterTimeout } from "../../lib/browser.ts";
import type { FacebookSnapshotLine } from "./parse.ts";
import {
  cleanAuthorHeading,
  cleanBodyText,
  extractCardFromLabel,
  extractFacebookSourceItemId,
  extractHrefFromHtml,
  extractImageSrcFromHtml,
  isAgeLabel,
  isFacebookPermalinkUrl,
  isFacebookItemWorthKeeping,
  isFacebookStopHeading,
  isNoiseStaticText,
  parseSnapshotLine,
  scoreFacebookItemQuality,
} from "./parse.ts";
import type {
  BrowserSession,
  CaptureAdapter,
  FeedBrowserConfig,
  FeedDocument,
  FeedItem,
  FeedMedia,
} from "../../lib/types.ts";

type FacebookEnrichmentRef = {
  ref: string;
  label?: string | null;
  alt?: string | null;
};

type FacebookCaptureItem = FeedItem & {
  _media_refs?: FacebookEnrichmentRef[];
  _author_image_ref?: string | null;
  _link_refs?: FacebookEnrichmentRef[];
};

function findAuthorImageRef(
  lines: FacebookSnapshotLine[],
  index: number,
  authorName: string,
): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor];
    if (!line) continue;
    if (line.type === "heading" && line.level === 4) break;
    if (isFacebookStopHeading(line)) break;
    if (line.type !== "link" || !line.ref) continue;
    const label = String(line.label || "");
    if (
      label === authorName ||
      label === `${authorName}, view story` ||
      label.startsWith(`${authorName}, `) ||
      label.includes(authorName)
    ) {
      return line.ref;
    }
  }
  return null;
}

function parsePostBlock(
  lines: FacebookSnapshotLine[],
  index: number,
): { item: FacebookCaptureItem; nextIndex: number } {
  const start = lines[index];
  if (!start) {
    throw new Error("Missing Facebook post heading");
  }
  const authorInfo = cleanAuthorHeading(start.label);
  const authorName = authorInfo.author;
  const item: FacebookCaptureItem = {
    source: "facebook",
    id: null,
    source_item_id: null,
    index: null,
    url: null,
    author: {
      handle: authorName || null,
      display_name: authorName || null,
      profile_image_url: null,
      profile_image_local: null,
    },
    content: {
      text: "",
    },
    stats: {
      reply: null,
      share: null,
      like: null,
      view: null,
    },
    media: [],
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
    embedded_links: [],
    _media_refs: [],
    _author_image_ref: findAuthorImageRef(lines, index, authorName),
    _link_refs: [],
  };

  const contentParts: string[] = [];
  const seenContent = new Set<string>();
  const stack: FacebookSnapshotLine[] = [];

  if (authorInfo.impliedText) {
    contentParts.push(authorInfo.impliedText);
    seenContent.add(authorInfo.impliedText);
  }

  let end = index + 1;
  for (; end < lines.length; end += 1) {
    const line = lines[end];
    if (!line) continue;
    if (
      line.type === "heading" &&
      line.level === 4 &&
      line.label &&
      line.label !== start.label
    ) {
      break;
    }
    if (isFacebookStopHeading(line)) break;

    while (stack.length > 0 && line.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const buttonAncestor = [...stack]
      .reverse()
      .find((entry) => entry.type === "button");
    const linkAncestor = [...stack]
      .reverse()
      .find((entry) => entry.type === "link");

    if (line.type === "button") {
      stack.push(line);
      continue;
    }

    if (line.type === "statictext") {
      const text = cleanBodyText(line.label);
      if (buttonAncestor) {
        if (!/^\d[\d,.KkMm]*$/.test(text)) {
          stack.push(line);
          continue;
        }
        if (buttonAncestor.label === "Like") item.stats.like = text;
        if (buttonAncestor.label === "Leave a comment") item.stats.reply = text;
        if (/send this to friends|share/i.test(buttonAncestor.label || "")) {
          item.stats.share = text;
        }
        stack.push(line);
        continue;
      }
      if (linkAncestor) {
        stack.push(line);
        continue;
      }
      if (isNoiseStaticText(text)) {
        stack.push(line);
        continue;
      }
      if (!seenContent.has(text)) {
        seenContent.add(text);
        contentParts.push(text);
      }
      stack.push(line);
      continue;
    }

    if (line.type === "link") {
      const label = cleanBodyText(line.label);
      item._link_refs ??= [];
      item._media_refs ??= [];
      if (line.ref) {
        item._link_refs.push({
          ref: line.ref,
          label,
        });
      }
      if (
        !label ||
        label === authorName ||
        label === "updated his profile picture." ||
        label === `${authorName}, view story` ||
        label === "See translation" ||
        label === "hide post" ||
        isAgeLabel(label)
      ) {
        stack.push(line);
        continue;
      }

      const card = extractCardFromLabel(label);
      if (card) {
        item.cards.push(card);
        stack.push(line);
        continue;
      }

      if (
        label === "No photo description available." ||
        label === "May be pop art" ||
        label === "Es ļoti mīlu māksliniekus"
      ) {
        if (line.ref) item._media_refs.push({ ref: line.ref, alt: label });
        stack.push(line);
        continue;
      }

      stack.push(line);
      continue;
    }
  }

  item.content.text = contentParts.join("\n").trim();
  return { item, nextIndex: end - 1 };
}

function parseSnapshotDocument(snapshot: string, limit: number): FeedDocument {
  const lines = String(snapshot || "")
    .split("\n")
    .map((line) => parseSnapshotLine(line))
    .filter((line): line is FacebookSnapshotLine => Boolean(line));

  const feedStart = lines.findIndex(
    (line) =>
      line.type === "heading" &&
      line.level === 3 &&
      line.label === "Feed posts",
  );
  if (feedStart < 0) {
    return {
      schema_version: 1,
      source: "facebook",
      captured_at: new Date().toISOString(),
      items: [],
    };
  }

  const items: FacebookCaptureItem[] = [];
  for (
    let index = feedStart + 1;
    index < lines.length && items.length < limit;
    index += 1
  ) {
    const line = lines[index];
    if (!line) continue;
    if (isFacebookStopHeading(line) && line.label !== "Reels") break;
    if (line.type !== "heading" || line.level !== 4) continue;
    const { item, nextIndex } = parsePostBlock(lines, index);
    if (item.author.handle && item.content.text) {
      item.index = items.length + 1;
      items.push(item);
    }
    index = Math.max(index, nextIndex);
  }

  return {
    schema_version: 1,
    source: "facebook",
    captured_at: new Date().toISOString(),
    items,
  };
}

function enrichFacebookItem(
  item: FacebookCaptureItem,
  browser: BrowserSession,
): FacebookCaptureItem {
  const media: FeedMedia[] = [];
  const embeddedLinks: FeedItem["embedded_links"] = [];
  const seenEmbeddedLinks = new Set<string>();
  for (const ref of item._media_refs ?? []) {
    try {
      const html = browser.getHtml(`@${ref.ref}`);
      const src = extractImageSrcFromHtml(html);
      if (!src) continue;
      media.push({
        src,
        href: null,
        alt: ref.alt || null,
        media_kind: "image",
      });
    } catch (err) {
      // Snapshot ref missing or DOM changed while resolving media.
      void err;
    }
  }

  let profileImageUrl = item.author?.profile_image_url || null;
  if (item._author_image_ref) {
    try {
      const html = browser.getHtml(`@${item._author_image_ref}`);
      profileImageUrl = extractImageSrcFromHtml(html) || profileImageUrl;
    } catch (err) {
      // Author image ref may be stale or missing.
      void err;
    }
  }

  let permalinkUrl = item.url || null;
  let sourceItemId = item.source_item_id || null;
  for (const linkRef of item._link_refs ?? []) {
    if (!linkRef.ref) continue;
    try {
      const html = browser.getHtml(`@${linkRef.ref}`);
      const href = canonicalizeItemUrl("facebook", extractHrefFromHtml(html));
      if (!href) continue;

      if (!permalinkUrl && isFacebookPermalinkUrl(href)) {
        permalinkUrl = href;
        sourceItemId = extractFacebookSourceItemId(href) || sourceItemId;
        continue;
      }

      if (isFacebookPermalinkUrl(href)) continue;

      const kind = href.includes("facebook.com") ? "entity" : "link";
      if (seenEmbeddedLinks.has(href)) continue;
      seenEmbeddedLinks.add(href);
      embeddedLinks.push({
        href,
        text: linkRef.label || null,
        kind,
      });
    } catch (err) {
      void err;
    }
  }

  return {
    ...item,
    source_item_id: sourceItemId,
    url: permalinkUrl,
    author: {
      handle: item.author.handle,
      display_name: item.author.display_name,
      profile_image_url: profileImageUrl,
      profile_image_local: item.author.profile_image_local,
    },
    embedded_links: embeddedLinks,
    media,
    _author_image_ref: undefined,
    _link_refs: undefined,
    _media_refs: undefined,
  };
}

function captureFacebookSnapshot(browser: BrowserSession): string {
  const hasMain = browser.evalJson<boolean>(
    `(() => JSON.stringify(Boolean(document.querySelector("main"))))()`,
  );
  if (hasMain) {
    return browser.snapshotText(["-c", "-s", "main"]);
  }
  return browser.snapshotText(["-c"]);
}

function prepareFacebookFeed(browser: BrowserSession): void {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1600, 500);
  browser.ensureUrl("https://www.facebook.com/");
  browser.reloadCurrentTab();
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.evalText(`(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return JSON.stringify({ ok: true });
  })()`);
  browser.tryWaitForFunction(
    `(() => {
      const text = document.body?.innerText || "";
      const feedishText =
        text.includes("Feed posts") ||
        text.includes("What's on your mind") ||
        text.includes("Create story") ||
        text.includes("Reels");
      const feedishDom =
        document.querySelectorAll('[role="feed"], [role="article"], div[aria-posinset]').length > 0;
      return feedishText || feedishDom;
    })()`,
    mediumWait,
  );
  assertFeedPageAccessible(
    { sourceName: "facebook", browser },
    {
      blockedUrlPatterns: [/\/login/i],
      blockedTextPatterns: [
        /\blog in to facebook\b/i,
        /\bforgotten password\b/i,
      ],
    },
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
  prepareFacebookFeed(browser);

  const collectedItems: FacebookCaptureItem[] = [];
  const seen = new Set<string>();

  function mergeBatch(snapshot: string): void {
    const document = parseSnapshotDocument(snapshot, limit * 2);
    collectUniqueItems(document.items, {
      seen,
      sourceName: "facebook",
      target: collectedItems,
      mapItem: (rawItem: unknown) =>
        enrichFacebookItem(rawItem as FacebookCaptureItem, browser),
      shouldInclude: isFacebookItemWorthKeeping,
    });
  }

  mergeBatch(captureFacebookSnapshot(browser));
  if (collectedItems.length === 0) {
    prepareFacebookFeed(browser);
    mergeBatch(captureFacebookSnapshot(browser));
  }

  const scrollPasses = Math.max(3, Math.min(8, limit));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 2;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    const { scrollHeight: beforeHeight } = browser.evalJson<{
      scrollHeight: number;
    }>(`(() => JSON.stringify({
      scrollHeight: document.scrollingElement?.scrollHeight || document.body?.scrollHeight || 0
    }))()`);
    browser.evalText(`(() => {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
      return JSON.stringify({ ok: true, y: window.scrollY });
    })()`);
    try {
      browser.waitForFunction(
        `(document.scrollingElement?.scrollHeight || document.body?.scrollHeight || 0) > ${beforeHeight}`,
        2500,
      );
    } catch (err) {
      void err;
    }
    mergeBatch(captureFacebookSnapshot(browser));
    stagnantPasses =
      collectedItems.length > beforeCount ? 0 : stagnantPasses + 1;
  }

  const document: FeedDocument = {
    schema_version: 1,
    source: "facebook",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
  assertAuthenticatedCapture(
    { sourceName: "facebook", browser, document },
    {
      blockedUrlPatterns: [/\/login/i],
      blockedTextPatterns: [
        /\blog in to facebook\b/i,
        /\bforgotten password\b/i,
      ],
    },
  );
  return document;
}

const source = {
  name: "facebook",
  captureDocument,
} satisfies CaptureAdapter;
const prepareFeed = prepareFacebookFeed;

// CiC path reads the rendered DOM directly because the accessibility-tree
// snapshot used by the default adapter has no equivalent inside Chrome.
export function buildExtractionScript(limit: number): string {
  return buildBrowserRuntimeScript(
    limit,
    `
    const FB_BASE = "https://www.facebook.com";

    function isPostPermalink(url) {
      try {
        const parsed = new URL(url, FB_BASE);
        const host = parsed.hostname.replace(/^www\\./, '');
        if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return false;
        const path = parsed.pathname.replace(/\\/+$/, '');
        if (/\\/groups\\/[^/]+\\/(?:posts|permalink)\\/[^/?#]+$/i.test(path)) return true;
        if (/\\/reel\\/\\d+$/i.test(path)) return true;
        if (/\\/videos\\/\\d+$/i.test(path)) return true;
        if (/\\/[^/]+\\/posts\\/[^/?#]+$/i.test(path)) return true;
        if (path === '/watch' && parsed.searchParams.get('v')) return true;
        if (path === '/photo' && parsed.searchParams.get('fbid')) return true;
        if (path === '/permalink.php' && parsed.searchParams.get('story_fbid')) return true;
      } catch {
        return false;
      }
      return false;
    }

    function pickPermalink(root) {
      const links = Array.from(root.querySelectorAll('a[href]'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const abs = makeAbsoluteUrl(href, FB_BASE);
        if (!abs) continue;
        if (isPostPermalink(abs)) {
          return abs;
        }
      }
      const timeLink = root.querySelector('a[role="link"] time, a[role="link"] abbr')?.closest('a[href]');
      const timeHref = timeLink?.getAttribute('href');
      return timeHref ? makeAbsoluteUrl(timeHref, FB_BASE) : null;
    }

    function pickAuthorLink(root) {
      const links = Array.from(root.querySelectorAll('h2 a[href], h3 a[href], h4 a[href], strong a[href]'));
      for (const link of links) {
        const text = textOf(link);
        if (text && text.length > 1) return link;
      }
      // Fallback: first profile/page link with non-empty text.
      const fallback = Array.from(root.querySelectorAll('a[href]')).find((link) => {
        const href = link.getAttribute('href') || '';
        const text = textOf(link);
        return text.length > 1 && /^\\/(?!plugins|sharer|home|login)[A-Za-z0-9._-]+\\/?($|\\?)/.test(href);
      });
      return fallback || null;
    }

    function pickAuthorImage(root, authorName) {
      const images = Array.from(root.querySelectorAll('image[xlink\\\\:href], svg image, img[src]'));
      for (const img of images) {
        const alt = String(img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
        const xlink = img.getAttribute('xlink:href') || img.getAttribute('href');
        const src = img.currentSrc || img.src || xlink || null;
        if (!src) continue;
        if (alt && authorName && alt.includes(authorName)) return src;
        if (/profile/i.test(alt)) return src;
      }
      return null;
    }

    function isNoiseRoot(root) {
      const text = (root.innerText || '').replace(/\\s+/g, ' ').trim();
      if (!text) return true;
      if (/^People you may know/i.test(text)) return true;
      if (/^Suggested for you/i.test(text)) return true;
      if (/^Friend requests/i.test(text)) return true;
      if (/^Stories/i.test(text)) return true;
      if (/^Reels\b/i.test(text)) return true;
      if (!root.querySelector('h2, h3, h4, strong a[href]')) return true;
      return false;
    }

    function getStats(root) {
      const text = multilineTextOf(root);
      function pick(re) {
        const m = text.match(re);
        return m ? normalizeCount(m[1]) : null;
      }
      return {
        like: pick(/(\\d[\\d,.KkMm]*)\\s+(?:reactions?|likes?)/i),
        reply: pick(/(\\d[\\d,.KkMm]*)\\s+comments?/i),
        share: pick(/(\\d[\\d,.KkMm]*)\\s+shares?/i),
        view: pick(/(\\d[\\d,.KkMm]*)\\s+views?/i),
      };
    }

    function getMedia(root, authorImageUrl) {
      const out = [];
      const seen = new Set();
      for (const video of Array.from(root.querySelectorAll('video[poster], video[src]'))) {
        const src = video.getAttribute('poster') || video.getAttribute('src') || null;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        out.push({
          src,
          href: video.closest('a[href]')?.href || null,
          alt: video.getAttribute('aria-label') || 'video',
          media_kind: 'video',
        });
      }
      for (const img of Array.from(root.querySelectorAll('img[src]'))) {
        const src = img.currentSrc || img.src || '';
        if (!src || src === authorImageUrl || seen.has(src)) continue;
        const rect = img.getBoundingClientRect();
        if (rect.width < 120 && rect.height < 120) continue;
        seen.add(src);
        out.push({
          src,
          href: img.closest('a[href]')?.href || null,
          alt: img.getAttribute('alt') || null,
          media_kind: 'image',
        });
      }
      return out;
    }

    function getPostText(root, authorName) {
      const blocks = Array.from(root.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"], div[dir="auto"]'));
      const candidates = blocks
        .map((node) => multilineTextOf(node))
        .filter((text) => text && text !== authorName && text.length > 12);
      candidates.sort((a, b) => b.length - a.length);
      if (candidates[0]) return candidates[0];
      const lines = linesOf(root);
      return lines
        .filter((line) => line && line !== authorName && line.length > 12 && !/^\\d+[smhdwy]$/i.test(line))
        .slice(0, 4)
        .join('\\n');
    }

    function getEmbeddedLinks(root, permalinkUrl) {
      const out = [];
      const seen = new Set();
      for (const link of Array.from(root.querySelectorAll('a[href]'))) {
        const href = makeAbsoluteUrl(link.getAttribute('href'), FB_BASE);
        if (!href || href === permalinkUrl || seen.has(href)) continue;
        if (/^https:\\/\\/www\\.facebook\\.com\\/(?:plugins|sharer|home|login|stories)/i.test(href)) continue;
        if (/^https:\\/\\/www\\.facebook\\.com\\/[A-Za-z0-9._-]+\\/?$/.test(href)) continue;
        seen.add(href);
        out.push({
          href,
          text: textOf(link) || null,
          kind: /facebook\\.com/i.test(href) ? 'entity' : 'link',
        });
      }
      return out;
    }

    function candidateRoots() {
      const seen = new Set();
      const roots = [];
      for (const selector of ['[role="article"]', '[aria-posinset]']) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          if (seen.has(node)) continue;
          if (selector === '[role="article"]' && node.parentElement?.closest('[role="article"]')) continue;
          seen.add(node);
          roots.push(node);
        }
      }
      return roots;
    }

    const items = candidateRoots()
      .slice(0, limit * 3)
      .map((root) => {
        if (isNoiseRoot(root)) return null;
        const permalinkUrl = pickPermalink(root);
        const authorLink = pickAuthorLink(root);
        const authorName = textOf(authorLink) || null;
        const authorHref = authorLink?.href ? makeAbsoluteUrl(authorLink.getAttribute('href'), FB_BASE) : null;
        const authorImageUrl = pickAuthorImage(root, authorName);
        const text = getPostText(root, authorName);
        if (!text || text.length < 12) return null;
        return {
          url: permalinkUrl,
          author: {
            handle: authorName,
            display_name: authorName,
            profile_image_url: authorImageUrl,
            profile_url: authorHref,
          },
          content: { text },
          stats: getStats(root),
          media: getMedia(root, authorImageUrl),
          cards: [],
          embedded_links: getEmbeddedLinks(root, permalinkUrl),
          thread: {
            has_thread_line: false,
            thread_line_height: null,
            thread_line_x: null,
            child_candidate_index: null,
            child_candidate_handle: null,
            child_candidate_url: null,
            relationship_confidence: null,
          },
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    return JSON.stringify({
      schema_version: 1,
      source: "facebook",
      captured_at: new Date().toISOString(),
      items,
    });
    `,
  );
}

type RawFacebookExtractionPayload = {
  captured_at?: string | null;
  items: Parameters<typeof normalizeItemShape>[0][];
};

function assertRawFacebookExtractionPayload(
  payload: unknown,
): asserts payload is RawFacebookExtractionPayload {
  if (!isPlainObject(payload) || !Array.isArray(payload.items)) {
    throw new Error("Invalid facebook extraction payload");
  }
}

export function normalizeFacebookExtractionDocument(
  payload: unknown,
): FeedDocument {
  assertRawFacebookExtractionPayload(payload);
  const capturedAt =
    typeof payload.captured_at === "string" && payload.captured_at
      ? payload.captured_at
      : new Date().toISOString();
  const items = payload.items
    .map((item, index) => {
      const url = typeof item.url === "string" ? item.url : null;
      const sourceItemId =
        extractFacebookSourceItemId(url) ||
        (typeof item.source_item_id === "string" ? item.source_item_id : null);
      return normalizeItemShape(
        { ...item, source_item_id: sourceItemId },
        { source: "facebook", index: index + 1 },
      );
    })
    .filter((item) => isFacebookItemWorthKeeping(item));
  return {
    schema_version: 1,
    source: "facebook",
    captured_at: capturedAt,
    items,
  };
}

export {
  source,
  prepareFeed,
  extractFacebookSourceItemId,
  isFacebookItemWorthKeeping,
  scoreFacebookItemQuality,
};
