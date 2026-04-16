#!/usr/bin/env node
"use strict";

const { createBrowserSession, jitterTimeout } = require("../../lib/browser");
const { buildBrowserRuntimeScript } = require("../browser-runtime/core");
const {
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  collectUniqueItems,
} = require("../../lib/source-capture");

function extractLinkedInSourceItemId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.linkedin.com");
    const feedMatch = parsed.pathname.match(
      /\/feed\/update\/(urn:li:[^/]+)\/?/,
    );
    if (feedMatch) return feedMatch[1];
    const pulseMatch = parsed.pathname.match(/\/pulse\/([^/?#]+)/);
    if (pulseMatch) return `pulse:${pulseMatch[1]}`;
    const postsMatch = parsed.pathname.match(/\/posts\/([^/?#]+)/);
    if (postsMatch) return `posts:${postsMatch[1]}`;
    return null;
  } catch {
    return null;
  }
}

function scoreLinkedInItemQuality(item) {
  const text = String(item?.content?.text || "").trim();
  const author = String(item?.author?.handle || "").trim();
  const permalink = String(item?.source_item_id || "").trim();
  const stats = item?.stats || {};
  const engagementSignals = [
    stats.reply,
    stats.share,
    stats.like,
    stats.view,
  ].filter(Boolean).length;
  let score = 0;

  if (permalink) score += 4;
  if (author) score += 2;
  if (text.length >= 40) score += 3;
  else if (text.length >= 15) score += 1;
  if (engagementSignals > 0) score += 1;
  if (Array.isArray(item?.media) && item.media.length > 0) score += 1;
  if (Array.isArray(item?.cards) && item.cards.length > 0) score += 1;

  if (/^Feed post\b/i.test(text)) score -= 2;
  if (/loves this/i.test(text)) score -= 2;
  if (/and \d+ other connections follow/i.test(text)) score -= 1;
  if (text.length < 15 && !permalink) score -= 2;

  return score;
}

function isLinkedInItemWorthKeeping(item) {
  if (!item) return false;
  if (item.source_item_id) return true;
  return scoreLinkedInItemQuality(item) >= 3;
}

function buildExtractionScript(limit) {
  return buildBrowserRuntimeScript(
    limit,
    `
    const ACTION_LABELS = ["Like", "Comment", "Repost", "Send"];

    function cleanAuthorName(value) {
      return String(value || "")
        .split("•")[0]
        .replace(/\\s+/g, " ")
        .trim() || null;
    }

    function parseCountFromText(text, label) {
      const pattern = new RegExp("(\\\\d[\\\\d,.KkMm]*)\\\\s+" + label, "i");
      const match = String(text || "").match(pattern);
      return match ? match[1] : null;
    }

    function containsActionRow(node) {
      const text = textOf(node);
      return ACTION_LABELS.filter((label) => text.includes(label)).length >= 3;
    }

    function isFeedPostMarker(node) {
      return textOf(node) === "Feed post";
    }

    function isPermalink(href) {
      return /\\/feed\\/update\\/|\\/pulse\\/|\\/posts\\//.test(href || "");
    }

    function isCompanyPostsUrl(url) {
      return /\\/company\\/[^/]+\\/posts\\/?/.test(url || "");
    }

    function getPermalinkLinks(root) {
      return Array.from(root.querySelectorAll("a[href]")).filter((link) => {
        const href = link.getAttribute("href") || "";
        return isPermalink(href);
      });
    }

    function findCandidateRoot(startNode) {
      let node = startNode?.closest("div, article, section, li") || startNode?.parentElement || null;
      let fallback = null;
      for (let depth = 0; depth < 10 && node; depth += 1, node = node.parentElement) {
        const text = multilineTextOf(node);
        if (text.length < 40) continue;
        const hasPermalink = getPermalinkLinks(node).length > 0;
        const hasActions = containsActionRow(node);
        const hasFeedPost = text.includes("Feed post");
        const isPromoted = /\\bPromoted\\b/.test(text);
        if ((hasPermalink || hasActions || isPromoted || hasFeedPost) && !fallback) {
          fallback = node;
        }
        if (
          ((hasPermalink || hasFeedPost) && hasActions) ||
          (isPromoted && hasActions)
        ) {
          return node;
        }
      }
      return fallback;
    }

    function getActionRoots() {
      const controls = Array.from(document.querySelectorAll("button, a")).filter((el) => {
        const text = textOf(el);
        const aria = el.getAttribute("aria-label") || "";
        return (
          ACTION_LABELS.includes(text) ||
          /Reaction button state|Open reactions menu/i.test(aria)
        );
      });
      return controls
        .map((control) => findCandidateRoot(control))
        .filter(Boolean);
    }

    function getPermalinkRoots() {
      const links = Array.from(document.querySelectorAll("a[href]")).filter((link) => {
        const href = link.getAttribute("href") || "";
        const text = textOf(link);
        return isPermalink(href) && text.length > 0;
      });
      return links.map((link) => findCandidateRoot(link)).filter(Boolean);
    }

    function getFeedPostRoots() {
      const markers = Array.from(document.querySelectorAll("span, div")).filter((node) => {
        if (!isFeedPostMarker(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
      });
      return markers.map((node) => findCandidateRoot(node)).filter(Boolean);
    }

    function getMainFeedRoots() {
      const main = document.querySelector("main");
      if (!main) return [];
      const nodes = Array.from(main.querySelectorAll("div, section, article, li"));
      return nodes
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.height < 180 || rect.width < 200) return false;
          const text = multilineTextOf(node);
          return (
            text.length > 80 &&
            containsActionRow(node) &&
            (text.includes("Feed post") ||
              getPermalinkLinks(node).length > 0 ||
              /\\bPromoted\\b/.test(text))
          );
        })
        .map((node) => findCandidateRoot(node))
        .filter(Boolean);
    }

    function dedupeNodes(nodes) {
      const out = [];
      for (const node of nodes) {
        if (!node) continue;
        if (out.some((existing) => existing === node || existing.contains(node) || node.contains(existing))) {
          const existingIndex = out.findIndex((existing) => existing.contains(node));
          if (existingIndex >= 0) out[existingIndex] = node;
          continue;
        }
        out.push(node);
      }
      return out;
    }

    function discoverCandidateRoots() {
      return dedupeNodes([
        ...getMainFeedRoots(),
        ...getFeedPostRoots(),
        ...getActionRoots(),
        ...getPermalinkRoots(),
      ]);
    }

    function chooseAuthorLink(root, permalinkUrl) {
      const links = Array.from(root.querySelectorAll("a[href]"));
      return links.find((link) => {
        const href = link.href || "";
        if (!href || href === permalinkUrl) return false;
        return /\\/in\\/|\\/company\\/|\\/school\\//.test(href) && textOf(link).length > 0;
      }) || null;
    }

    function chooseCompanyLikeLink(root, permalinkUrl) {
      const links = Array.from(root.querySelectorAll("a[href]"));
      return links.find((link) => {
        const href = link.href || "";
        if (!href || href === permalinkUrl) return false;
        return /\\/company\\/|\\/school\\//.test(href) && textOf(link).length > 0;
      }) || null;
    }

    function isHeaderLine(line) {
      return (
        line === "Feed post" ||
        line === "Follow" ||
        line === "Promoted" ||
        /•\\s*(1st|2nd|3rd)/i.test(line) ||
        /^\\d+[smhdwy]\\s*[•.]?$/i.test(line) ||
        /^•\\s*(1st|2nd|3rd)$/i.test(line) ||
        /followers?$/i.test(line) ||
        /and \\d+ others (reacted|commented|reposted)/i.test(line) ||
        /loves this$/i.test(line) ||
        line === "Get started"
      );
    }

    function isFooterLine(line) {
      return (
        ACTION_LABELS.includes(line) ||
        /^\\d[\\d,.KkMm]*\\s+reactions?$/i.test(line) ||
        /^\\d[\\d,.KkMm]*\\s+comments?$/i.test(line) ||
        /^\\d[\\d,.KkMm]*\\s+reposts?$/i.test(line) ||
        line === "Send"
      );
    }

    function getAuthorName(root, permalinkUrl, promoted) {
      const preferCompany = promoted || isCompanyPostsUrl(permalinkUrl);
      const authorLink = promoted
        ? chooseCompanyLikeLink(root, permalinkUrl) ||
          chooseAuthorLink(root, permalinkUrl)
        : preferCompany
          ? chooseCompanyLikeLink(root, permalinkUrl) ||
            chooseAuthorLink(root, permalinkUrl)
        : chooseAuthorLink(root, permalinkUrl);
      const authorLines = linesOf(authorLink);
      const authorFromLink = authorLines.find(
        (line) => line.length > 1 && !isHeaderLine(line),
      );
      if (authorFromLink) return cleanAuthorName(authorFromLink);

      const lines = linesOf(root);
      const contentStart = lines.findIndex((line) => !isHeaderLine(line) && line.length > 20);
      const headerLines = contentStart > 0 ? lines.slice(0, contentStart) : lines.slice(0, 6);
      const headerName = headerLines.find((line) => {
        return (
          line.length > 1 &&
          !isHeaderLine(line) &&
          !/Policy Officer|Director|Manager|Research|Executive|Engineer|Officer|Analyst/i.test(line)
        );
      }) || null;
      return cleanAuthorName(headerName);
    }

    function getPostText(root, permalinkUrl) {
      const links = getPermalinkLinks(root)
        .filter((link) => link.href !== permalinkUrl)
        .map((link) => multilineTextOf(link))
        .filter((text) => text.length > 30);
      const longestLinkText = links.sort((a, b) => b.length - a.length)[0] || "";
      if (longestLinkText) return longestLinkText;

      const lines = linesOf(root);
      const metadataBoundary = lines.findIndex((line) =>
        /^\\d+[smhdwy]\\s*[•.]?$/i.test(line) ||
        /followers?$/i.test(line) ||
        line === "Promoted",
      );
      const scanLines = metadataBoundary >= 0 ? lines.slice(metadataBoundary + 1) : lines;
      const contentStart = scanLines.findIndex(
        (line) => !isHeaderLine(line) && line.length > 20,
      );
      if (contentStart < 0) return lines.filter((line) => !isHeaderLine(line) && !isFooterLine(line)).join("\\n").trim();

      const contentLines = [];
      for (const line of scanLines.slice(contentStart)) {
        if (isFooterLine(line)) break;
        if (isHeaderLine(line)) continue;
        contentLines.push(line);
      }
      return contentLines.join("\\n").trim();
    }

    function getStats(root) {
      const text = multilineTextOf(root);
      return {
        reply: parseCountFromText(text, "comments?") || null,
        share: parseCountFromText(text, "reposts?") || parseCountFromText(text, "shares?") || null,
        like: parseCountFromText(text, "reactions?") || parseCountFromText(text, "likes?") || null,
        view: parseCountFromText(text, "views?") || parseCountFromText(text, "impressions?") || null,
      };
    }

    function getMedia(root, authorImageUrl) {
      const images = Array.from(root.querySelectorAll("img[src]"));
      const videos = Array.from(root.querySelectorAll("video[poster], video[src]"));
      const seen = new Set();
      const media = [];

      for (const video of videos) {
        const src = video.getAttribute("poster") || video.getAttribute("src") || "";
        if (!src || seen.has(src)) continue;
        media.push({
          src,
          href: video.closest("a[href]")?.href || null,
          alt: video.getAttribute("aria-label") || "video",
          media_kind: "video",
        });
        seen.add(src);
      }

      for (const img of images) {
        const src = img.currentSrc || img.src || "";
        if (!src || src === authorImageUrl || seen.has(src)) continue;
        const rect = img.getBoundingClientRect();
        if (rect.width < 80 && rect.height < 80) continue;
        media.push({
          src,
          href: img.closest("a[href]")?.href || null,
          alt: img.getAttribute("alt") || null,
          media_kind: "image",
        });
        seen.add(src);
      }

      return media;
    }

    function getEmbeddedLinks(root, permalinkUrl) {
      const links = Array.from(root.querySelectorAll("a[href]"));
      const seen = new Set();
      const out = [];
      for (const link of links) {
        const href = link.href || "";
        if (!href || href === permalinkUrl || seen.has(href)) continue;
        if (/\\/in\\/|\\/company\\/|\\/school\\/|\\/feed\\/update\\//.test(href)) continue;
        seen.add(href);
        out.push({
          href,
          text: textOf(link) || null,
          kind: href.includes("linkedin.com") ? "entity" : "link",
        });
      }
      return out;
    }

    function getCards(root, permalinkUrl) {
      const external = getEmbeddedLinks(root, permalinkUrl).find((link) => link.kind === "link");
      if (!external) return [];
      return [
        {
          kind: "external_card",
          href: external.href,
          domain: (() => {
            try {
              return new URL(external.href).hostname.replace(/^www\\./, "");
            } catch {
              return "link";
            }
          })(),
          title: external.text || external.href,
          description: null,
          text: external.text || external.href,
          image_url: null,
        },
      ];
    }

    function extractItem(root, idx) {
      const permalink = getPermalinkLinks(root)[0] || null;
      const url = permalink?.href || null;
      const rootText = multilineTextOf(root);
      const promoted = /\\bPromoted\\b/.test(rootText);
      if (!url && !promoted && !containsActionRow(root)) return null;
      const authorText = getAuthorName(root, url, promoted);
      const authorImageUrl = root.querySelector("img[src]")?.currentSrc || root.querySelector("img[src]")?.src || null;
      const text = getPostText(root, url);
      if (!text || text.length < 20) return null;
      const stats = getStats(root);
      const media = getMedia(root, authorImageUrl);
      const embeddedLinks = getEmbeddedLinks(root, url);
      const cards = getCards(root, url);

      return {
        source: "linkedin",
        source_item_id: url ? (${extractLinkedInSourceItemId.toString()})(url) : null,
        index: idx + 1,
        url,
        author: {
          handle: authorText || null,
          display_name: authorText || null,
          profile_image_url: authorImageUrl,
        },
        content: {
          text,
        },
        stats,
        media,
        cards,
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
        platform: {
          promoted,
        },
      };
    }

    const items = discoverCandidateRoots()
      .slice(0, limit * 3)
      .map((root, idx) => extractItem(root, idx))
      .filter((item) => item && (item.url || item.content.text));

    return JSON.stringify({
      schema_version: 1,
      source: "linkedin",
      captured_at: new Date().toISOString(),
      items,
    });
    `,
  );
}

function prepareLinkedInFeed(browser) {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1600, 500);
  browser.ensureTab(
    "https://www.linkedin.com/feed",
    "https://www.linkedin.com/feed/",
  );
  browser.reloadCurrentTab();
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.tryWaitForFunction(
    `(() => {
      const hasMain = Boolean(document.querySelector("main"));
      const text = document.body?.innerText || "";
      return hasMain || text.includes("Start a post") || text.includes("Feed");
    })()`,
    mediumWait,
  );
  assertFeedPageAccessible(
    { sourceName: "linkedin", browser },
    {
      blockedUrlPatterns: [/\/login/i, /\/authwall/i],
      blockedTextPatterns: [/\bsign in\b/i, /\bjoin now\b/i],
    },
  );
  browser.evalText(`(() => {
    const main = document.querySelector("main");
    if (main) {
      main.scrollTo({ top: 0, behavior: "instant" });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    return JSON.stringify({ ok: true });
  })()`);
  browser.tryWaitForFunction(
    `(() => {
      const actions = document.querySelectorAll('main a[href], main button').length;
      const text = document.body?.innerText || "";
      return actions > 0 || text.includes("Start a post") || text.includes("Comment");
    })()`,
    jitterTimeout(900, 300),
  );
}

async function captureDocument({ limit = 12, browserOptions = {} }) {
  const browser = createBrowserSession(browserOptions);
  prepareLinkedInFeed(browser);

  const collectedItems = [];
  const seen = new Set();

  function mergeBatch(document) {
    collectUniqueItems(document.items, {
      seen,
      sourceName: "linkedin",
      target: collectedItems,
      shouldInclude: isLinkedInItemWorthKeeping,
    });
  }

  mergeBatch(browser.evalJson(buildExtractionScript(limit)));
  if (collectedItems.length === 0) {
    prepareLinkedInFeed(browser);
    mergeBatch(browser.evalJson(buildExtractionScript(limit)));
  }

  const scrollPasses = Math.max(4, Math.min(14, limit + 2));
  let stagnantPasses = 0;
  for (
    let index = 0;
    index < scrollPasses && collectedItems.length < limit && stagnantPasses < 3;
    index += 1
  ) {
    const beforeCount = collectedItems.length;
    const beforeMetrics = browser.evalJson(`(() => JSON.stringify({
      scrollHeight: document.querySelector("main")?.scrollHeight || document.scrollingElement?.scrollHeight || 0
    }))()`);
    browser.evalText(`(() => {
      const main = document.querySelector("main");
      if (main) {
        main.scrollBy({ top: Math.round(main.clientHeight * 0.75), behavior: "instant" });
        return JSON.stringify({ ok: true, target: "main", y: main.scrollTop });
      }
      window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "instant" });
      return JSON.stringify({ ok: true, target: "window", y: window.scrollY });
    })()`);
    try {
      browser.waitForFunction(
        `(document.querySelector("main")?.scrollHeight || document.scrollingElement?.scrollHeight || 0) > ${beforeMetrics.scrollHeight}`,
        2500,
      );
    } catch (err) {
      void err;
    }
    mergeBatch(browser.evalJson(buildExtractionScript(limit)));
    stagnantPasses =
      collectedItems.length > beforeCount ? 0 : stagnantPasses + 1;
  }

  const document = {
    schema_version: 1,
    source: "linkedin",
    captured_at: new Date().toISOString(),
    items: collectedItems.slice(0, limit),
  };
  assertAuthenticatedCapture(
    { sourceName: "linkedin", browser, document },
    {
      blockedUrlPatterns: [/\/login/i, /\/authwall/i],
      blockedTextPatterns: [/\bsign in\b/i, /\bjoin now\b/i],
    },
  );
  return document;
}

const source = {
  name: "linkedin",
  captureDocument,
};
const prepareFeed = prepareLinkedInFeed;

module.exports = {
  buildExtractionScript,
  source,
  prepareFeed,
  extractLinkedInSourceItemId,
  isLinkedInItemWorthKeeping,
  scoreLinkedInItemQuality,
};
