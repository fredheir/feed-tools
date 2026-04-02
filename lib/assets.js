"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function buildPlaceholderDataUri(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="100%" height="100%" fill="#dfe8eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#536471" font-family="sans-serif" font-size="28">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return path.extname(pathname) || ".img";
  } catch {
    return ".img";
  }
}

function extFromContentType(contentType) {
  if (!contentType) return null;
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/gif")) return ".gif";
  if (contentType.includes("image/avif")) return ".avif";
  return null;
}

async function download(url, prefix, assetsDir, existingFiles) {
  if (!url) return null;

  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  const needle = `${prefix}-${hash}.`;
  const existing = existingFiles.find((name) => name.startsWith(needle));
  if (existing) return path.join(assetsDir, existing);

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`failed to download ${url}: ${response.status}`);

  const ext =
    extFromContentType(response.headers.get("content-type")) || extFromUrl(url);
  const target = path.join(assetsDir, `${prefix}-${hash}${ext}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

async function downloadDocumentAssets(document, assetsDir) {
  fs.mkdirSync(assetsDir, { recursive: true });
  const existingFiles = fs.readdirSync(assetsDir);

  const jobs = [];
  for (const item of document.items) {
    jobs.push(
      download(
        item.author?.profile_image_url,
        `profile-${item.index}`,
        assetsDir,
        existingFiles,
      )
        .then((local) => {
          if (item.author) item.author.profile_image_local = local;
        })
        .catch((error) => {
          console.warn(`asset warning: ${error.message}`);
          if (item.author) {
            item.author.profile_image_local =
              buildPlaceholderDataUri("profile");
          }
        }),
    );
    const mediaItems = Array.isArray(item.media) ? item.media : [];
    for (const [index, media] of mediaItems.entries()) {
      jobs.push(
        download(
          media.src,
          `media-${item.index}-${index + 1}`,
          assetsDir,
          existingFiles,
        )
          .then((local) => {
            media.local_src = local;
          })
          .catch((error) => {
            console.warn(`asset warning: ${error.message}`);
            media.local_src = media.src || buildPlaceholderDataUri("media");
          }),
      );
    }
    const cards = Array.isArray(item.cards) ? item.cards : [];
    for (const [index, card] of cards.entries()) {
      jobs.push(
        download(
          card.image_url,
          `card-${item.index}-${index + 1}`,
          assetsDir,
          existingFiles,
        )
          .then((local) => {
            card.image_local = local;
          })
          .catch((error) => {
            console.warn(`asset warning: ${error.message}`);
            card.image_local =
              card.image_url || buildPlaceholderDataUri("preview");
          }),
      );
    }
  }
  await Promise.all(jobs);

  return document;
}

module.exports = {
  downloadDocumentAssets,
};
