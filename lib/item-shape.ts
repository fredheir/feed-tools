import * as crypto from "node:crypto";

import type {
  FeedCard,
  FeedDocument,
  FeedEmbeddedLink,
  FeedItem,
  FeedMedia,
  FeedThread,
} from "./types.ts";
export type { FeedDocument, FeedItem } from "./types.ts";

type LooseFeedItem = Partial<FeedItem> & {
  text?: string | null;
  stats?: Partial<FeedItem["stats"]> | null;
  author?: Partial<FeedItem["author"]> | null;
  content?: Partial<FeedItem["content"]> | null;
  thread?: Partial<FeedThread> | null;
  media?: FeedMedia[] | null;
  cards?: FeedCard[] | null;
  embedded_links?: FeedEmbeddedLink[] | null;
};

function valueOrNull<T>(value: T | null | undefined | ""): T | null {
  return value == null || value === "" ? null : value;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeObject<T extends object>(value: unknown): Partial<T> {
  return isPlainObject(value) ? (value as Partial<T>) : {};
}

function isFallbackItemId(value: string | null | undefined): boolean {
  return /:(synthetic|row):/.test(String(value || ""));
}

function isGenericLinkedInPostsPath(value: string | null | undefined): boolean {
  return /^\/company\/[^/]+\/posts\/?$/.test(String(value || ""));
}

function isGenericLinkedInPostsId(value: string | null | undefined): boolean {
  return /^linkedin:\/company\/[^/]+\/posts\/?$/.test(String(value || ""));
}

export function sanitizeSourceItemId(
  source: string,
  value: string | null | undefined,
): string | null {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  if (source === "linkedin" && isGenericLinkedInPostsPath(normalized)) {
    return null;
  }
  return String(normalized);
}

export function sanitizeItemId(
  source: string,
  value: string | null | undefined,
): string | null {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  if (source === "linkedin" && isGenericLinkedInPostsId(normalized)) {
    return null;
  }
  return String(normalized);
}

function canonicalizeGenericUrl(
  value: string | null | undefined,
  base?: string,
): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, base);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith("utm_") ||
        key === "fbclid" ||
        key === "ref" ||
        key === "refsrc" ||
        key === "trackingId" ||
        key === "trk" ||
        key === "trkEmail" ||
        key === "midToken"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    if (!parsed.searchParams.toString()) parsed.search = "";
    return parsed.toString();
  } catch {
    return valueOrNull(value);
  }
}

function canonicalizeFacebookUrl(
  value: string | null | undefined,
): string | null {
  const normalized = canonicalizeGenericUrl(value, "https://www.facebook.com");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);

    if (parsed.hostname === "l.facebook.com") {
      const redirected = parsed.searchParams.get("u");
      return redirected ? canonicalizeFacebookUrl(redirected) : null;
    }

    if (parsed.pathname === "/plugins/post.php") {
      const href = parsed.searchParams.get("href");
      return href ? canonicalizeFacebookUrl(href) : null;
    }

    parsed.hostname = "www.facebook.com";
    parsed.hash = "";

    if (parsed.pathname === "/permalink.php") {
      const storyId = parsed.searchParams.get("story_fbid");
      const accountId = parsed.searchParams.get("id");
      parsed.search = "";
      if (storyId) parsed.searchParams.set("story_fbid", storyId);
      if (accountId) parsed.searchParams.set("id", accountId);
      return parsed.toString();
    }

    if (parsed.pathname === "/photo") {
      const photoId = parsed.searchParams.get("fbid");
      parsed.search = "";
      if (photoId) parsed.searchParams.set("fbid", photoId);
      return parsed.toString();
    }

    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith("__") ||
        key === "comment_id" ||
        key === "reply_comment_id" ||
        key === "notif_id"
      ) {
        parsed.searchParams.delete(key);
      }
    }
    if (!parsed.searchParams.toString()) parsed.search = "";

    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function canonicalizeSocialUrl(
  value: string | null | undefined,
  hostname: string,
  { alwaysClearSearch = false } = {},
): string | null {
  const normalized = canonicalizeGenericUrl(value, `https://${hostname}`);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    parsed.hostname = hostname;
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    if (alwaysClearSearch || !parsed.searchParams.toString()) {
      parsed.search = "";
    }
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function canonicalizeYouTubeUrl(
  value: string | null | undefined,
): string | null {
  const normalized = canonicalizeGenericUrl(value, "https://www.youtube.com");
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    const isShortHost = parsed.hostname === "youtu.be";
    if (isShortHost) {
      const videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0];
      parsed.hostname = "www.youtube.com";
      parsed.pathname = "/watch";
      parsed.search = "";
      if (videoId) parsed.searchParams.set("v", videoId);
      parsed.hash = "";
      return parsed.toString();
    }
    parsed.hash = "";

    if (/^\/watch\/?$/.test(parsed.pathname)) {
      const videoId = parsed.searchParams.get("v");
      const playlistId = parsed.searchParams.get("list");
      parsed.pathname = "/watch";
      parsed.search = "";
      if (videoId) parsed.searchParams.set("v", videoId);
      if (!videoId && playlistId) parsed.searchParams.set("list", playlistId);
      return parsed.toString();
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) {
      parsed.pathname = `/shorts/${shortsMatch[1]}`;
      parsed.search = "";
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return normalized;
  }
}

export function canonicalizeItemUrl(
  source: string,
  value: string | null | undefined,
): string | null {
  const normalized = valueOrNull(value);
  if (!normalized) return null;
  if (source === "facebook") return canonicalizeFacebookUrl(normalized);
  if (source === "instagram")
    return canonicalizeSocialUrl(normalized, "www.instagram.com");
  if (source === "linkedin")
    return canonicalizeSocialUrl(normalized, "www.linkedin.com");
  if (source === "youtube") return canonicalizeYouTubeUrl(normalized);
  if (source === "x")
    return canonicalizeSocialUrl(normalized, "x.com", {
      alwaysClearSearch: true,
    });
  return canonicalizeGenericUrl(normalized);
}

export function assertFeedDocument(
  document: unknown,
  context = "operation",
): asserts document is FeedDocument {
  if (!isPlainObject(document) || !Array.isArray(document.items)) {
    throw new Error(
      `Expected standardized feed document with .items array in ${context}`,
    );
  }
}

function isGenericIdentityUrl(
  source: string,
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (source === "linkedin") {
      return isGenericLinkedInPostsPath(parsed.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

function buildSyntheticFingerprint(
  item: LooseFeedItem,
  source: string,
): string {
  const authorHandle = valueOrNull(item?.author?.handle) || "";
  const contentText =
    valueOrNull(item?.content?.text) || valueOrNull(item?.text) || "";
  const firstLink =
    valueOrNull(item?.embedded_links?.[0]?.href) ||
    valueOrNull(item?.cards?.[0]?.href) ||
    "";
  const firstMedia =
    valueOrNull(item?.media?.[0]?.src) ||
    valueOrNull(item?.media?.[0]?.href) ||
    "";
  const url = canonicalizeItemUrl(source, item?.url) || "";
  return [source, authorHandle, contentText, firstLink, firstMedia, url].join(
    "\n",
  );
}

export function getSyntheticItemId(
  item: LooseFeedItem,
  source: string,
): string {
  const fingerprint = buildSyntheticFingerprint(item, source);
  const hash = crypto
    .createHash("sha1")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 12);
  return `${source}:synthetic:${hash}`;
}

export function getPreferredItemKey(
  item: LooseFeedItem,
  fallback: { source?: string | null; index?: number | null } = {},
): string {
  const source = item?.source || fallback.source || "unknown";
  const itemId = sanitizeItemId(source, item?.id);
  const sourceItemId = sanitizeSourceItemId(source, item?.source_item_id);
  const url = canonicalizeItemUrl(source, item?.url);

  if (itemId && !isFallbackItemId(itemId)) return itemId;
  if (sourceItemId) return `${source}:${sourceItemId}`;
  if (url && !isGenericIdentityUrl(source, url)) return url;
  if (itemId) return itemId;
  return getSyntheticItemId(item, source);
}

export function normalizeItemShape(
  item: LooseFeedItem,
  fallback: { source?: string | null; index?: number | null } = {},
): FeedItem {
  const source = item?.source || fallback.source || "unknown";
  const sourceItemId = sanitizeSourceItemId(
    source,
    item?.source_item_id ?? null,
  );
  const author = normalizeObject<FeedItem["author"]>(item?.author);
  const content = normalizeObject<FeedItem["content"]>(item?.content);
  const thread = normalizeObject<FeedThread>(item?.thread);
  const itemId = sanitizeItemId(source, item?.id);
  const url = canonicalizeItemUrl(source, item?.url);

  return {
    id:
      itemId ||
      (sourceItemId
        ? `${source}:${sourceItemId}`
        : getSyntheticItemId(item, source)),
    source,
    source_item_id: sourceItemId,
    index: item?.index ?? fallback.index ?? null,
    url,
    author: {
      handle: valueOrNull(author.handle),
      display_name: valueOrNull(author.display_name),
      profile_image_url: valueOrNull(author.profile_image_url),
      profile_image_local: valueOrNull(author.profile_image_local),
    },
    content: {
      text: valueOrNull(content.text) || "",
    },
    stats: {
      reply: valueOrNull(item?.stats?.reply),
      share: valueOrNull(item?.stats?.share),
      like: valueOrNull(item?.stats?.like),
      view: valueOrNull(item?.stats?.view),
    },
    media: normalizeArray(item?.media),
    cards: normalizeArray(item?.cards),
    thread: {
      has_thread_line: Boolean(thread.has_thread_line),
      thread_line_height: valueOrNull(thread.thread_line_height),
      thread_line_x: valueOrNull(thread.thread_line_x),
      child_candidate_index: valueOrNull(thread.child_candidate_index),
      child_candidate_handle: valueOrNull(thread.child_candidate_handle),
      child_candidate_url: valueOrNull(thread.child_candidate_url),
      relationship_confidence: valueOrNull(thread.relationship_confidence),
    },
    embedded_links: normalizeArray(item?.embedded_links),
  };
}
