#!/usr/bin/env node
"use strict";

const { createBrowserSession, jitterTimeout } = require("../../lib/browser");
const { getPreferredItemKey } = require("../../lib/item-shape");
const { runSourceCapture } = require("../../lib/source-capture");

function buildExtractionScript(limit) {
  return `(() => {
    const limit = ${JSON.stringify(limit)};
    const maxArticles = Math.max(limit * 3, limit);

    function textOf(node) {
      return (node?.innerText || node?.textContent || "").replace(/\\s+/g, " ").trim();
    }

    function multilineTextOf(node) {
      return (node?.innerText || node?.textContent || "")
        .split(/\\n+/)
        .map((line) => line.replace(/[ \\t]+/g, " ").trim())
        .filter(Boolean)
        .join("\\n");
    }

    function findThreadLine(article) {
      const nodes = Array.from(article.querySelectorAll("div"));
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        const bg = cs.backgroundColor;
        if (width === 2 && height >= 40 && bg === "rgb(207, 217, 222)") {
          return { width, height, x: Math.round(rect.x), y: Math.round(rect.y), bg };
        }
      }
      return null;
    }

    function parseCount(label, pattern) {
      const match = label.match(pattern);
      return match ? match[1] : null;
    }

    function getStats(article) {
      const labels = Array.from(article.querySelectorAll("[aria-label]"))
        .map((el) => el.getAttribute("aria-label"))
        .filter(Boolean);
      return {
        reply: parseCount(labels.find((s) => /repl/i.test(s)) || "", /(\\d[\\d,Kk.]*)\\s+repl/i) || null,
        share: parseCount(labels.find((s) => /repost/i.test(s)) || "", /(\\d[\\d,Kk.]*)\\s+repost/i) || null,
        like: parseCount(labels.find((s) => /like/i.test(s)) || "", /(\\d[\\d,Kk.]*)\\s+like/i) || null,
        view: parseCount(labels.find((s) => /view post analytics|views?/i.test(s)) || "", /(\\d[\\d,Kk.]*)\\s+views?/i) || null,
      };
    }

    function getEmbeddedLinks(article) {
      const links = Array.from(article.querySelectorAll("a[href]"));
      const articleUrl = getStatusUrl(article);
      const seen = new Set();
      const out = [];
      for (const link of links) {
        const href = link.href || null;
        const text = textOf(link) || null;
        if (!href || href === articleUrl || seen.has(href)) continue;
        const isProfileLink = /^https:\\/\\/x\\.com\\/[^/]+\\/?$/.test(href);
        const isAnalytics = /\\/analytics$/.test(href);
        const isStatusMedia = /\\/status\\/\\d+\\/(photo|video)\\/\\d+$/.test(href);
        const isQuoted = /\\/status\\/\\d+$/.test(href);
        if (isProfileLink || isAnalytics || isStatusMedia || isQuoted) continue;
        const kind = href.startsWith("https://x.com/search?") ? "entity" : "link";
        seen.add(href);
        out.push({ href, text, kind });
      }
      return out;
    }

    function getStatusUrl(article) {
      const timeLink = article.querySelector("time")?.closest("a[href]");
      if (timeLink?.href) return timeLink.href;

      const statusLink = Array.from(article.querySelectorAll("a[href]")).find((link) => {
        const href = link.href || "";
        return (
          /\\/status\\/\\d+$/.test(href) &&
          !/\\/analytics$/.test(href) &&
          !/\\/status\\/\\d+\\/(photo|video)\\/\\d+$/.test(href)
        );
      });
      return statusLink?.href || null;
    }

    function getProfileImageUrl(article) {
      const avatarImg =
        article.querySelector('[data-testid="Tweet-User-Avatar"] img[src]') ||
        article.querySelector('[data-testid^="UserAvatar-Container-"] img[src]');
      if (avatarImg?.src) return avatarImg.src;

      const fallback = Array.from(article.querySelectorAll("img[src]")).find((img) => {
        const src = img.src || "";
        return (
          src.includes("pbs.twimg.com/profile_images/") ||
          /_normal\\./.test(src) ||
          /_mini\\./.test(src)
        );
      });
      return fallback?.src || null;
    }

    function isHydratedItem(item) {
      return Boolean(
        item?.author?.handle &&
        item?.content?.text &&
        item?.url
      );
    }

    function getEmbeddedMedia(article) {
      const videos = Array.from(article.querySelectorAll("video[poster]"));
      const images = Array.from(article.querySelectorAll("img[src]"));
      const seen = new Set();
      const out = [];

      for (const video of videos) {
        const src = video.getAttribute("poster") || "";
        if (!src || seen.has(src)) continue;
        const parentLink = video.closest("a[href]");
        out.push({
          src,
          href: parentLink?.href || null,
          alt: video.getAttribute("aria-label") || "video thumbnail",
          media_kind: "video",
        });
        seen.add(src);
      }

      for (const img of images) {
        const src = img.src || "";
        if (!src.includes("pbs.twimg.com/media/")) continue;
        if (seen.has(src)) continue;
        const parentLink = img.closest("a[href]");
        out.push({
          src,
          href: parentLink?.href || null,
          alt: img.getAttribute("alt") || null,
          media_kind: /\\/video\\/\\d+$/.test(parentLink?.href || "") ? "video" : "image",
        });
        seen.add(src);
      }
      return out;
    }

    function getPreviewCards(article) {
      const links = Array.from(article.querySelectorAll("a[href]"));
      const roleLinks = Array.from(article.querySelectorAll('[role="link"]'));
      const articleUrl = getStatusUrl(article);
      const seen = new Set();
      const out = [];

      for (const link of links) {
        const href = link.href || null;
        if (!href || href === articleUrl || seen.has(href)) continue;
        const text = textOf(link);
        const lines = text.split(/\\n+/).map((line) => line.replace(/\\s+/g, " ").trim()).filter(Boolean);
        const img = link.querySelector("img[src]")?.src || null;
        const handle = Array.from(link.querySelectorAll('a[href^="/"], span'))
          .map((el) => textOf(el))
          .find((t) => t.startsWith("@")) || null;

        const isProfileLink = /^https:\\/\\/x\\.com\\/[^/]+\\/?$/.test(href);
        const isAnalytics = /\\/analytics$/.test(href);
        const isSearch = href.startsWith("https://x.com/search?");
        const isStatusMedia = /\\/status\\/\\d+\\/(photo|video)\\/\\d+$/.test(href);
        if (isProfileLink || isAnalytics || isSearch || isStatusMedia) continue;

        if (/\\/status\\/\\d+$/.test(href) && text.length > 20) {
          out.push({
            kind: "quoted_post",
            href,
            handle,
            text: lines.slice(-3).join(" ").trim() || text,
            image_url: img,
          });
          seen.add(href);
          continue;
        }

        try {
          const url = new URL(href);
          if (url.hostname !== "x.com" && text.length > 10) {
            const domainLine = lines.find((line) => /\\.[a-z]{2,}/i.test(line) && line.length < 80) || (url.hostname === "t.co" ? null : url.hostname.replace(/^www\\./, ""));
            const nonDomainLines = lines.filter((line) => line !== domainLine);
            out.push({
              kind: "external_card",
              href,
              domain: domainLine || url.hostname.replace(/^www\\./, ""),
              title: nonDomainLines[0] || text,
              description: nonDomainLines.slice(1).join(" ").trim() || null,
              text,
              image_url: img,
            });
            seen.add(href);
          }
        } catch (err) {
          // Skip malformed URLs from DOM (e.g. relative or invalid href).
          void err;
        }
      }

      for (const block of roleLinks) {
        if (block.tagName === "A") continue;
        const text = textOf(block);
        if (text.length < 20 || seen.has(text)) continue;
        const nestedHref = Array.from(block.querySelectorAll('a[href]'))
          .map((a) => a.href)
          .find((href) => href && href !== articleUrl && /\\/status\\/\\d+$/.test(href)) || null;
        const handle = Array.from(block.querySelectorAll('a[href^="/"], span'))
          .map((el) => textOf(el))
          .find((t) => t.startsWith("@")) || text.match(/(@[A-Za-z0-9_]+)/)?.[1] || null;
        const image = block.querySelector("img[src]")?.src || null;
        const looksLikeQuote = !!handle || /·\\s*\\d+[mhds]/i.test(text) || text.includes("Replying to");
        if (!looksLikeQuote) continue;
        out.push({
          kind: "quoted_post",
          href: nestedHref,
          handle,
          text,
          image_url: image,
        });
        seen.add(text);
      }
      return out;
    }

    function getFallbackQuotedPost(article, articleUrl) {
      const fullText = textOf(article);
      if (!fullText.includes("Quote")) return null;
      const quoteLink = Array.from(article.querySelectorAll('a[href]'))
        .map((a) => a.href)
        .find((href) => href && href !== articleUrl && /\\/status\\/\\d+$/.test(href));
      if (!quoteLink) return null;
      const quotePart = fullText.split("Quote")[1]?.trim() || "";
      if (quotePart.length < 20) return null;
      return {
        kind: "quoted_post",
        href: quoteLink,
        handle: quotePart.match(/(@[A-Za-z0-9_]+)/)?.[1] || null,
        text: quotePart,
        image_url: null,
      };
    }

    const articles = Array.from(document.querySelectorAll("article")).slice(0, maxArticles);
    const items = articles.map((article, idx) => {
      const handle = Array.from(article.querySelectorAll('a[href^="/"]'))
        .find((a) => textOf(a).startsWith("@"))
        ?.textContent?.trim() || null;
      const url = getStatusUrl(article);
      const source_item_id = url ? (url.match(/\\/status\\/(\\d+)/)?.[1] || null) : null;
      const profile_image_url = getProfileImageUrl(article);
      const text = multilineTextOf(article.querySelector('[data-testid="tweetText"]')) || multilineTextOf(article).slice(0, 280);
      const line = findThreadLine(article);
      const stats = getStats(article);
      const cards = getPreviewCards(article);
      if (cards.length === 0) {
        const fallbackQuote = getFallbackQuotedPost(article, url);
        if (fallbackQuote) cards.push(fallbackQuote);
      }
      const media = getEmbeddedMedia(article);

      return {
        source: "x",
        source_item_id,
        index: idx + 1,
        url,
        author: {
          handle,
          display_name: null,
          profile_image_url,
        },
        content: { text },
        stats,
        media,
        cards,
        thread: {
          has_thread_line: Boolean(line),
          thread_line_height: line?.height || null,
          thread_line_x: line?.x || null,
        },
        embedded_links: getEmbeddedLinks(article),
        capture_incomplete: !isHydratedItem({
          author: { handle, profile_image_url },
          content: { text },
          url,
        }),
      };
    });

    const hydrated = items.filter((item) => isHydratedItem(item));
    const incomplete = items.filter((item) => !isHydratedItem(item));

    return JSON.stringify({
      schema_version: 1,
      source: "x",
      captured_at: new Date().toISOString(),
      items: hydrated.slice(0, limit).map((item, idx) => ({
        ...item,
        thread: {
          ...item.thread,
          child_candidate_index: item.thread.has_thread_line && idx < hydrated.length - 1 ? hydrated[idx + 1].index : null,
          child_candidate_handle: item.thread.has_thread_line && idx < hydrated.length - 1 ? hydrated[idx + 1].author.handle : null,
          child_candidate_url: item.thread.has_thread_line && idx < hydrated.length - 1 ? hydrated[idx + 1].url : null,
          relationship_confidence: item.thread.has_thread_line && idx < hydrated.length - 1 ? "medium" : null
        }
      })),
      meta: {
        article_count: articles.length,
        hydrated_count: hydrated.length,
        incomplete_count: incomplete.length
      }
    });
  })()`;
}

function prepareXFeed(browser) {
  const shortWait = jitterTimeout(900, 300);
  const mediumWait = jitterTimeout(1600, 500);
  const hydrationWait = jitterTimeout(3500, 900);
  browser.ensureTab(
    ["https://x.com/", "https://twitter.com/"],
    "https://x.com/home",
  );
  browser.tryWaitForFunction("document.readyState === 'complete'", shortWait);
  browser.tryWaitForFunction(
    `(() => {
      const articleCount = document.querySelectorAll('article').length;
      const text = document.body?.innerText || "";
      return articleCount > 0 || text.includes("For you") || text.includes("Following");
    })()`,
    mediumWait,
  );
  browser.tryWaitForFunction(
    `(() => {
      const articles = Array.from(document.querySelectorAll('article')).slice(0, 6);
      if (articles.length === 0) return false;
      return articles.some((article) => {
        const hasText = Boolean(article.querySelector('[data-testid="tweetText"]'));
        const hasAvatar = Boolean(
          article.querySelector('[data-testid="Tweet-User-Avatar"] img[src]') ||
          article.querySelector('img[src*="pbs.twimg.com/profile_images/"]')
        );
        const hasStatusLink = Array.from(article.querySelectorAll('a[href]')).some((link) => {
          const href = link.href || '';
          return /\\/status\\/\\d+$/.test(href) && !/\\/analytics$/.test(href);
        });
        return hasText && hasAvatar && hasStatusLink;
      });
    })()`,
    hydrationWait,
  );
  browser.evalText(`(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return JSON.stringify({ ok: true });
  })()`);
  browser.tryWaitForFunction(
    `(() => {
      const articleCount = document.querySelectorAll('article').length;
      const text = document.body?.innerText || "";
      return articleCount > 0 || text.includes("For you") || text.includes("Following");
    })()`,
    jitterTimeout(900, 300),
  );
  browser.tryWaitForFunction(
    `(() => {
      const articles = Array.from(document.querySelectorAll('article')).slice(0, 6);
      if (articles.length === 0) return false;
      return articles.filter((article) => {
        const hasText = Boolean(article.querySelector('[data-testid="tweetText"]'));
        const hasAvatar = Boolean(
          article.querySelector('[data-testid="Tweet-User-Avatar"] img[src]') ||
          article.querySelector('img[src*="pbs.twimg.com/profile_images/"]')
        );
        const hasStatusLink = Array.from(article.querySelectorAll('a[href]')).some((link) => {
          const href = link.href || '';
          return /\\/status\\/\\d+$/.test(href) && !/\\/analytics$/.test(href);
        });
        return hasText && hasAvatar && hasStatusLink;
      }).length >= Math.min(3, articles.length);
    })()`,
    hydrationWait,
  );
}

async function captureDocument({ limit = 12, browserOptions = {} }) {
  const browser = createBrowserSession(browserOptions);
  prepareXFeed(browser);

  let bestDocument = null;
  const attempts = [
    { waitMs: 0, allowReload: false },
    { waitMs: jitterTimeout(1200, 400), allowReload: false },
    { waitMs: jitterTimeout(2200, 600), allowReload: false },
  ];

  for (const attempt of attempts) {
    if (attempt.waitMs > 0) browser.waitMilliseconds(attempt.waitMs);
    if (attempt.allowReload) prepareXFeed(browser);

    const candidate = browser.evalJson(buildExtractionScript(limit));
    if (
      !bestDocument ||
      (candidate.items || []).length > (bestDocument.items || []).length ||
      ((candidate.meta || {}).hydrated_count || 0) >
        ((bestDocument.meta || {}).hydrated_count || 0)
    ) {
      bestDocument = candidate;
    }
    if ((candidate.items || []).length >= limit) break;
  }

  const document = bestDocument || {
    schema_version: 1,
    source: "x",
    captured_at: new Date().toISOString(),
    items: [],
  };
  const seen = new Set();
  document.items = (document.items || []).filter((item) => {
    const key = getPreferredItemKey(item, {
      source: "x",
      index: item.index,
    });
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return document;
}

const xSource = {
  name: "x",
  captureDocument,
};

async function captureX(options) {
  return runSourceCapture(xSource, options);
}

module.exports = {
  captureX,
  prepareXFeed,
};
