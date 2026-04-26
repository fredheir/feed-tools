import * as fs from "node:fs";
import * as path from "node:path";

const PLATFORM_ICON_SET = {
  bluesky: { key: "bluesky", label: "BlueSky" },
  bsky: { key: "bluesky", label: "BlueSky" },
  facebook: { key: "fb", label: "Facebook" },
  fb: { key: "fb", label: "Facebook" },
  instagram: { key: "ig", label: "Instagram" },
  ig: { key: "ig", label: "Instagram" },
  tiktok: { key: "tt", label: "TikTok" },
  tt: { key: "tt", label: "TikTok" },
  youtube: { key: "yt", label: "YouTube" },
  yt: { key: "yt", label: "YouTube" },
  linkedin: { key: "linkedin", label: "LinkedIn" },
  x: { key: "x", label: "X" },
  twitter: { key: "x", label: "X" },
  telegram: { key: "tg", label: "Telegram" },
  tg: { key: "tg", label: "Telegram" },
} as const;

type PlatformIconKey = keyof typeof PLATFORM_ICON_SET;

const iconCache = new Map<string, string>();

export function getPlatformIconMeta(sourceName: string | null | undefined): {
  key: string;
  label: string;
} {
  const normalized = String(sourceName || "")
    .trim()
    .toLowerCase() as PlatformIconKey;
  return (
    PLATFORM_ICON_SET[normalized] || {
      key: "x",
      label: String(sourceName || "Feed"),
    }
  );
}

export function getPlatformIconDataUri(
  sourceName: string | null | undefined,
): string {
  const { key } = getPlatformIconMeta(sourceName);
  const cached = iconCache.get(key);
  if (cached) return cached;

  const iconPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "assets",
    "platforms",
    `${key}.svg`,
  );
  const svg = fs.readFileSync(iconPath, "utf8");
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  iconCache.set(key, dataUri);
  return dataUri;
}
