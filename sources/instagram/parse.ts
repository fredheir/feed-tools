export function extractInstagramSourceItemId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (!URL.canParse(url, "https://www.instagram.com")) return null;
  const parsed = new URL(url, "https://www.instagram.com");
  const match = parsed.pathname.match(/^\/(p|reel|tv)\/([^/?#]+)\/?$/);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function isInstagramPermalinkUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  if (!URL.canParse(url, "https://www.instagram.com")) return false;
  const parsed = new URL(url, "https://www.instagram.com");
  return /^\/(p|reel|tv)\/[^/?#]+\/?$/.test(parsed.pathname);
}

export function isInstagramProfileUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!URL.canParse(url, "https://www.instagram.com")) return false;
  const parsed = new URL(url, "https://www.instagram.com");
  if (parsed.hostname && !/instagram\.com$/i.test(parsed.hostname))
    return false;
  const match = parsed.pathname.match(/^\/([^/?#]+)\/?$/);
  if (!match) return false;
  return ![
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
  ].includes(match[1].toLowerCase());
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
