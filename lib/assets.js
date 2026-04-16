"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

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
  if (contentType.includes("video/mp4")) return ".mp4";
  if (contentType.includes("video/webm")) return ".webm";
  if (contentType.includes("video/quicktime")) return ".mov";
  return null;
}

function commandExists(command) {
  const pathEntries = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      if (fs.existsSync(candidate)) return true;
    }
  }
  return false;
}

function getYtDlpCommand() {
  if (commandExists("yt-dlp")) return { command: "yt-dlp", args: [] };
  if (commandExists("uvx"))
    return { command: "uvx", args: ["--from", "yt-dlp", "yt-dlp"] };
  return null;
}

function getFfprobeCommand() {
  return commandExists("ffprobe") ? "ffprobe" : null;
}

function getFfmpegCommand() {
  return commandExists("ffmpeg") ? "ffmpeg" : null;
}

function listCookieProfiles() {
  const candidates = [
    path.join(REPO_ROOT, ".chrome-cdp", "Default"),
    path.join(REPO_ROOT, "chrome-profile", "Default"),
    path.join(process.env.HOME || "", ".config", "google-chrome", "Default"),
    path.join(process.env.HOME || "", ".config", "chromium", "Default"),
  ];
  return candidates.filter((candidate) => {
    if (!candidate) return false;
    return fs.existsSync(path.join(candidate, "Cookies"));
  });
}

function resolveVideoUrl(item, media) {
  const candidates = [media?.href, item?.url];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (/^https?:$/i.test(parsed.protocol)) return parsed.toString();
    } catch {
      // Ignore malformed URLs and fall back to the next candidate.
    }
  }
  return null;
}

function shouldUseYtDlpForVideo(item, media) {
  if (media?.media_kind !== "video") return false;
  return Boolean(resolveVideoUrl(item, media));
}

function shouldUseCookiesForVideo(item) {
  return item?.source === "x" || item?.source === "instagram";
}

function getVideoCodec(filePath) {
  const ffprobe = getFfprobeCommand();
  if (!ffprobe) return null;
  try {
    const output = childProcess.execFileSync(
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "json",
        filePath,
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const parsed = JSON.parse(output);
    return parsed?.streams?.[0]?.codec_name || null;
  } catch {
    return null;
  }
}

function ensureBrowserPlayableVideo(filePath) {
  const codec = getVideoCodec(filePath);
  if (!codec || ["h264", "vp8", "vp9"].includes(codec)) return filePath;

  const ffmpeg = getFfmpegCommand();
  if (!ffmpeg) return filePath;

  const parsed = path.parse(filePath);
  const target = path.join(parsed.dir, `${parsed.name}-browser.mp4`);
  if (fs.existsSync(target)) return target;

  childProcess.execFileSync(
    ffmpeg,
    [
      "-y",
      "-i",
      filePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      target,
    ],
    {
      cwd: REPO_ROOT,
      stdio: "ignore",
      timeout: 180000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return target;
}

async function downloadMediaVideo(item, media, assetsDir, existingFiles) {
  if (media?.media_kind !== "video") return null;

  if (shouldUseYtDlpForVideo(item, media)) {
    const videoUrl = resolveVideoUrl(item, media);
    try {
      return ensureBrowserPlayableVideo(
        downloadVideoWithYtDlp(
          videoUrl,
          `video-${item.index}`,
          assetsDir,
          existingFiles,
          { useCookies: shouldUseCookiesForVideo(item) },
        ),
      );
    } catch (error) {
      if (!media?.video_src) throw error;
    }
  }

  if (media?.video_src) {
    return ensureBrowserPlayableVideo(
      await download(
        media.video_src,
        `video-${item.index}`,
        assetsDir,
        existingFiles,
      ),
    );
  }
  return null;
}

function downloadVideoWithYtDlp(
  url,
  prefix,
  assetsDir,
  existingFiles,
  options = {},
) {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  const needle = `${prefix}-${hash}.`;
  const existing = existingFiles.find((name) => name.startsWith(needle));
  if (existing) return path.join(assetsDir, existing);

  const targetTemplate = path.join(assetsDir, `${prefix}-${hash}.%(ext)s`);
  const tool = getYtDlpCommand();
  if (!tool) {
    throw new Error("yt-dlp is unavailable; install yt-dlp or uvx");
  }

  const cookieProfiles = options.useCookies ? listCookieProfiles() : [];
  const cookieArgs = cookieProfiles.length
    ? cookieProfiles.flatMap((profile) => [
        "--cookies-from-browser",
        `chrome:${profile}`,
      ])
    : [];
  const args = [
    ...tool.args,
    ...cookieArgs,
    "--no-playlist",
    "--no-progress",
    "--format",
    "bv*+ba/b",
    "-S",
    "ext:mp4:m4a",
    "--output",
    targetTemplate,
    "--print",
    "after_move:filepath",
    url,
  ];
  const output = childProcess.execFileSync(tool.command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const downloadedPath = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => path.isAbsolute(line) && fs.existsSync(line));
  if (!downloadedPath) {
    throw new Error(`yt-dlp did not report a downloaded file for ${url}`);
  }
  return downloadedPath;
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
      if (media?.media_kind === "video") {
        jobs.push(
          Promise.resolve()
            .then(() =>
              downloadMediaVideo(item, media, assetsDir, existingFiles),
            )
            .then((local) => {
              if (local) media.local_video_src = local;
            })
            .catch((error) => {
              console.warn(`asset warning: ${error.message}`);
            }),
        );
      }
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
