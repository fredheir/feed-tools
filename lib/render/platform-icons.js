"use strict";

const fs = require("node:fs");
const path = require("node:path");

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
};

const iconCache = new Map();

function getPlatformIconMeta(sourceName) {
  const normalized = String(sourceName || "")
    .trim()
    .toLowerCase();
  return (
    PLATFORM_ICON_SET[normalized] || {
      key: "x",
      label: String(sourceName || "Feed"),
    }
  );
}

function getPlatformIconDataUri(sourceName) {
  const { key } = getPlatformIconMeta(sourceName);
  if (iconCache.has(key)) return iconCache.get(key);

  const iconPath = path.resolve(
    __dirname,
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

module.exports = {
  getPlatformIconDataUri,
  getPlatformIconMeta,
};
