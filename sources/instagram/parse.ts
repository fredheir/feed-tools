export function extractInstagramSourceItemId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://www.instagram.com");
    const match = parsed.pathname.match(/^\/(p|reel|tv)\/([^/?#]+)\/?$/);
    return match ? `${match[1]}:${match[2]}` : null;
  } catch {
    return null;
  }
}

export function isInstagramPermalinkUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://www.instagram.com");
    return /^\/(p|reel|tv)\/[^/?#]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isInstagramProfileUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://www.instagram.com");
    if (parsed.hostname && !/instagram\.com$/i.test(parsed.hostname))
      return false;
    const match = parsed.pathname.match(/^\/([^/?#]+)\/?$/);
    if (!match) return false;
    const reservedSegments = new Set([
      "",
      "accounts",
      "about",
      "api",
      "developer",
      "direct",
      "explore",
      "legal",
      "reels",
      "stories",
      "web",
    ]);
    return !reservedSegments.has(match[1].toLowerCase());
  } catch {
    return false;
  }
}

export function isInstagramItemWorthKeeping(
  item:
    | { url?: string | null; source_item_id?: string | null }
    | null
    | undefined,
): boolean {
  if (!item) return false;
  if (!item.url || !item.source_item_id) {
    return false;
  }
  return true;
}
