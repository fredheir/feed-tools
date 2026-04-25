import type { FeedCard } from "../../lib/types.ts";

export type FacebookSnapshotLine = {
  indent: number;
  raw: string;
  type: string;
  label: string | null;
  ref: string | null;
  level: number | null;
};

type FacebookScoredCandidate = {
  source_item_id?: string | null;
  content?: { text?: string | null } | null;
  author?: { handle?: string | null } | null;
  stats?: {
    reply?: string | number | null;
    share?: string | number | null;
    like?: string | number | null;
    view?: string | number | null;
  } | null;
  media?: unknown[] | null;
  cards?: unknown[] | null;
};

function extractFacebookSourceItemId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.facebook.com");
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "l.facebook.com") {
      const redirected = parsed.searchParams.get("u");
      return redirected ? extractFacebookSourceItemId(redirected) : null;
    }

    if (host === "facebook.com" && parsed.pathname === "/plugins/post.php") {
      const wrappedHref = parsed.searchParams.get("href");
      return wrappedHref ? extractFacebookSourceItemId(wrappedHref) : null;
    }

    if (host !== "facebook.com" && !host.endsWith(".facebook.com")) {
      return null;
    }

    const path = parsed.pathname.replace(/\/+$/, "");
    let match = path.match(/\/groups\/[^/]+\/posts\/(\d+)/);
    if (match) return `groups:${match[1]}`;

    match = path.match(/\/reel\/(\d+)/);
    if (match) return `reel:${match[1]}`;

    match = path.match(/\/watch\/?\?v=(\d+)/);
    if (match) return `watch:${match[1]}`;

    match = path.match(/\/videos\/(\d+)/);
    if (match) return `video:${match[1]}`;

    match = path.match(/\/([^/]+)\/posts\/([^/?#]+)/);
    if (match) return `posts:${match[2]}`;

    const photoId = parsed.searchParams.get("fbid");
    if (path === "/photo" && photoId) return `photo:${photoId}`;

    const storyId = parsed.searchParams.get("story_fbid");
    if (path === "/permalink.php" && storyId) return `permalink:${storyId}`;

    return null;
  } catch {
    return null;
  }
}

function extractHrefFromHtml(html: string): string | null {
  const source = String(html || "");
  const href =
    source.match(/<a[^>]+href="([^"]+)"/i)?.[1] ||
    source.match(/href="([^"]+)"/i)?.[1] ||
    null;
  return href ? href.replace(/&amp;/g, "&") : null;
}

function isFacebookPermalinkUrl(url: string | null | undefined): boolean {
  return Boolean(extractFacebookSourceItemId(url));
}

function scoreFacebookItemQuality(item: FacebookScoredCandidate): number {
  const text = String(item?.content?.text || "").trim();
  const author = String(item?.author?.handle || "").trim();
  const sourceItemId = String(item?.source_item_id || "").trim();
  const stats = item?.stats || {};
  const engagementSignals = [
    stats.reply,
    stats.share,
    stats.like,
    stats.view,
  ].filter(Boolean).length;
  let score = 0;

  if (sourceItemId) score += 4;
  if (author) score += 2;
  if (text.length >= 80) score += 3;
  else if (text.length >= 30) score += 1;
  if (engagementSignals > 0) score += 1;
  if (Array.isArray(item?.media) && item.media.length > 0) score += 1;
  if (Array.isArray(item?.cards) && item.cards.length > 0) score += 1;

  if (/people you may know/i.test(text)) score -= 4;
  if (/add friend/i.test(text)) score -= 4;
  if (/suggested for you/i.test(text)) score -= 3;
  if (/create story/i.test(text)) score -= 3;
  if (/write a comment/i.test(text)) score -= 1;
  if (text.length < 20 && !sourceItemId) score -= 2;

  return score;
}

function isFacebookItemWorthKeeping(
  item: FacebookScoredCandidate | null | undefined,
): boolean {
  if (!item) return false;
  if (item.source_item_id) return true;
  return scoreFacebookItemQuality(item) >= 4;
}

function parseSnapshotLine(rawLine: string): FacebookSnapshotLine | null {
  const indent = rawLine.match(/^ */)?.[0].length || 0;
  const raw = rawLine.trim();
  if (!raw.startsWith("- ")) return null;
  const ref = raw.match(/\[ref=(e\d+)\]/)?.[1] || null;
  const level =
    Number.parseInt(raw.match(/level=(\d+)/)?.[1] || "", 10) || null;
  const typed = raw.match(/^- ([a-z]+)\s+"([^"]*)"/i);
  if (typed) {
    return {
      indent,
      raw,
      type: typed[1].toLowerCase(),
      label: typed[2],
      ref,
      level,
    };
  }
  const plain = raw.match(/^- ([a-z]+)/i);
  return {
    indent,
    raw,
    type: plain ? plain[1].toLowerCase() : "unknown",
    label: null,
    ref,
    level,
  };
}

function isFacebookStopHeading(line: FacebookSnapshotLine): boolean {
  return (
    line.type === "heading" &&
    ((line.level === 3 &&
      [
        "Reels",
        "Sponsored",
        "Friend requests",
        "Contacts",
        "Group chats",
      ].includes(line.label || "")) ||
      line.level === 1)
  );
}

function isAgeLabel(label: string | null | undefined): boolean {
  return /^\d+\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i.test(
    label || "",
  );
}

function isNoiseStaticText(label: string | null | undefined): boolean {
  const text = String(label || "").trim();
  if (!text) return true;
  if (text.length <= 1) return true;
  return (
    text === "Facebook" ||
    text === "Reels" ||
    text === "Verified account" ||
    text === "Shared with Public" ||
    /^Shared with /i.test(text) ||
    /^Are you interested in this post/i.test(text)
  );
}

function cleanBodyText(text: string | null | undefined): string {
  return String(text || "")
    .replace(/^["“”]\s*/, "")
    .replace(/\s*["“”]\s*$/, "")
    .trim();
}

function cleanAuthorHeading(label: string | null | undefined): {
  author: string;
  impliedText: string | null;
} {
  const text = String(label || "")
    .replace(/\s+Verified account$/i, "")
    .trim();
  const activityPatterns = [
    {
      pattern: /^(.*?)\s+updated (his|her|their) profile picture\.$/i,
      impliedText: "updated profile picture.",
    },
    {
      pattern: /^(.*?)\s+shared a memory\.$/i,
      impliedText: "shared a memory.",
    },
    {
      pattern: /^(.*?)\s+is with\s+.+$/i,
      impliedText: null,
    },
    {
      pattern: /^(.*?)\s+is in\s+.+$/i,
      impliedText: null,
    },
  ];

  for (const activity of activityPatterns) {
    const match = text.match(activity.pattern);
    if (!match) continue;
    return {
      author: match[1].trim(),
      impliedText: activity.impliedText,
    };
  }
  return { author: text, impliedText: null };
}

function extractCardFromLabel(
  label: string | null | undefined,
): FeedCard | null {
  const match = String(label || "").match(/^([a-z0-9.-]+\.[a-z]{2,})\s+(.+)$/i);
  if (!match) return null;
  return {
    kind: "external_card",
    href: null,
    domain: match[1].replace(/^www\./, ""),
    title: match[2].trim(),
    description: null,
    text: label,
    image_url: null,
  };
}

function extractImageSrcFromHtml(html: string): string | null {
  const source = String(html || "");
  const src =
    source.match(/<img[^>]+src="([^"]+)"/i)?.[1] ||
    source.match(/<image[^>]+xlink:href="([^"]+)"/i)?.[1] ||
    null;
  return src ? src.replace(/&amp;/g, "&") : null;
}

export {
  cleanAuthorHeading,
  cleanBodyText,
  extractCardFromLabel,
  extractHrefFromHtml,
  extractFacebookSourceItemId,
  extractImageSrcFromHtml,
  isAgeLabel,
  isFacebookPermalinkUrl,
  isFacebookItemWorthKeeping,
  isFacebookStopHeading,
  isNoiseStaticText,
  parseSnapshotLine,
  scoreFacebookItemQuality,
};
