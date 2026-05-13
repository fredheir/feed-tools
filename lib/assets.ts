import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { FeedDocument, FeedItem, FeedMedia } from "./types.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return path.extname(pathname) || ".img";
  } catch {
    return ".img";
  }
}

function extFromContentType(contentType: string | null): string | null {
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

const commandExistsCache = new Map<string, boolean>();
let commandExistsCachePath: string | null = null;

function commandExists(command: string): boolean {
  const currentPath = String(process.env.PATH || "");
  if (commandExistsCachePath !== currentPath) {
    commandExistsCache.clear();
    commandExistsCachePath = currentPath;
  }
  const cached = commandExistsCache.get(command);
  if (cached !== undefined) return cached;
  const pathEntries = currentPath.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      if (fs.existsSync(candidate)) {
        commandExistsCache.set(command, true);
        return true;
      }
    }
  }
  commandExistsCache.set(command, false);
  return false;
}

function getYtDlpCommand(): { command: string; args: string[] } | null {
  if (commandExists("yt-dlp")) return { command: "yt-dlp", args: [] };
  if (commandExists("uvx"))
    return { command: "uvx", args: ["--from", "yt-dlp", "yt-dlp"] };
  return null;
}

function getFfprobeCommand(): string | null {
  return commandExists("ffprobe") ? "ffprobe" : null;
}

function getFfmpegCommand(): string | null {
  return commandExists("ffmpeg") ? "ffmpeg" : null;
}

function listCookieProfiles(): string[] {
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

function resolveVideoUrl(item: FeedItem, media: FeedMedia): string | null {
  const candidates =
    item?.source === "youtube"
      ? [item?.url, media?.href]
      : [media?.href, item?.url];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!URL.canParse(candidate)) continue;
    const parsed = new URL(candidate);
    if (/^https?:$/i.test(parsed.protocol)) return parsed.toString();
  }
  return null;
}

function hashUrl(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
}

function shouldUseYtDlpForVideo(item: FeedItem, media: FeedMedia): boolean {
  if (media?.media_kind !== "video") return false;
  if (media?.download_video === false) return false;
  return Boolean(resolveVideoUrl(item, media));
}

function shouldUseCookiesForVideo(item: FeedItem): boolean {
  return item?.source === "x" || item?.source === "instagram";
}

type VideoProbeResult =
  | { ok: true; codec: string }
  | { ok: false; reason: string };

type BrowserPlayableVideoResult =
  | { ok: true; filePath: string }
  | { ok: false; reason: string };

function probeVideoCodec(filePath: string): VideoProbeResult {
  const ffprobe = getFfprobeCommand();
  if (!ffprobe) {
    return { ok: false, reason: "ffprobe is unavailable" };
  }
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
    const parsed = JSON.parse(output) as {
      streams?: Array<{ codec_name?: string }>;
    };
    const codec = parsed.streams?.[0]?.codec_name;
    if (!codec) {
      return {
        ok: false,
        reason: `ffprobe returned no video codec for ${filePath}`,
      };
    }
    return { ok: true, codec };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return {
      ok: false,
      reason: `ffprobe failed for ${filePath}: ${error.message}`,
    };
  }
}

function ensureBrowserPlayableVideo(
  filePath: string,
): BrowserPlayableVideoResult {
  const probed = probeVideoCodec(filePath);
  if (!probed.ok) {
    return { ok: false, reason: probed.reason };
  }
  if (["h264", "vp8", "vp9"].includes(probed.codec)) {
    return { ok: true, filePath };
  }

  const ffmpeg = getFfmpegCommand();
  if (!ffmpeg) {
    return {
      ok: false,
      reason: `ffmpeg is unavailable for transcoding codec ${probed.codec}`,
    };
  }

  const parsed = path.parse(filePath);
  const target = path.join(parsed.dir, `${parsed.name}-browser.mp4`);
  if (fs.existsSync(target)) {
    return { ok: true, filePath: target };
  }

  try {
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
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return {
      ok: false,
      reason: `ffmpeg failed to transcode ${filePath}: ${error.message}`,
    };
  }
  return { ok: true, filePath: target };
}

function removeStaleVideoDownload(pathToRemove: string): void {
  try {
    fs.rmSync(pathToRemove, { force: true });
  } catch {
    // Best effort cleanup: the fresh yt-dlp run below is the important part.
  }
}

function findReusableVideoDownload(
  assetsDir: string,
  prefix: string,
  hash: string,
): string | null {
  const needle = `${prefix}-${hash}.`;
  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => name.startsWith(needle))
    .map((name) => path.join(assetsDir, name))
    .sort((left, right) => left.localeCompare(right));

  for (const candidate of candidates) {
    const probed = probeVideoCodec(candidate);
    if (probed.ok) return candidate;
    if (probed.reason.includes("no video codec")) {
      removeStaleVideoDownload(candidate);
      continue;
    }
    return candidate;
  }
  return null;
}

async function downloadMediaVideo(
  item: FeedItem,
  media: FeedMedia,
  assetsDir: string,
  existingFiles: string[],
): Promise<string | null> {
  if (media?.media_kind !== "video") return null;

  if (shouldUseYtDlpForVideo(item, media)) {
    const videoUrl = resolveVideoUrl(item, media);
    if (!videoUrl) {
      throw new Error("Video capture expected a resolvable source URL");
    }
    const downloadedVideo = downloadVideoWithYtDlp(
      videoUrl,
      `video-${item.index}`,
      assetsDir,
      { useCookies: shouldUseCookiesForVideo(item) },
    );
    const preparedVideo = ensureBrowserPlayableVideo(downloadedVideo);
    if (preparedVideo.ok) return preparedVideo.filePath;
    throw new Error(preparedVideo.reason);
  }

  const directVideoSrc = media?.video_src;
  if (directVideoSrc) {
    const downloaded = await download(
      directVideoSrc,
      `video-${item.index}`,
      assetsDir,
      existingFiles,
    );
    if (!downloaded) {
      throw new Error(
        `Failed to download direct video asset for ${directVideoSrc}`,
      );
    }
    const preparedVideo = ensureBrowserPlayableVideo(downloaded);
    if (preparedVideo.ok) return preparedVideo.filePath;
    throw new Error(preparedVideo.reason);
  }
  return null;
}

function downloadVideoWithYtDlp(
  url: string,
  prefix: string,
  assetsDir: string,
  options: { useCookies?: boolean } = {},
): string {
  const hash = hashUrl(url);
  const existing = findReusableVideoDownload(assetsDir, prefix, hash);
  if (existing) return existing;

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
  const jsRuntimeArgs = commandExists("node") ? ["--js-runtimes", "node"] : [];
  const args = [
    ...tool.args,
    ...jsRuntimeArgs,
    ...cookieArgs,
    "--no-playlist",
    "--no-progress",
    "--format",
    "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/b[vcodec^=avc1][ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    "--merge-output-format",
    "mp4",
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
  const expectedPrefix = path.join(assetsDir, `${prefix}-${hash}.`);
  const downloadedPath = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find(
      (line) =>
        path.isAbsolute(line) &&
        fs.existsSync(line) &&
        line.startsWith(expectedPrefix),
    );
  if (downloadedPath) return downloadedPath;

  const materializedFile = fs
    .readdirSync(assetsDir)
    .find((name: string) => name.startsWith(`${prefix}-${hash}.`));
  if (materializedFile) {
    return path.join(assetsDir, materializedFile);
  }

  throw new Error(`yt-dlp did not report a downloaded file for ${url}`);
}

async function download(
  url: string | null | undefined,
  prefix: string,
  assetsDir: string,
  existingFiles: string[],
): Promise<string | null> {
  if (!url) return null;

  const hash = hashUrl(url);
  const needle = `${prefix}-${hash}.`;
  const existing = existingFiles.find((name) => name.startsWith(needle));
  if (existing) return path.join(assetsDir, existing);

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`failed to download ${url}: ${response.status}`);

  const ext =
    extFromContentType(response.headers.get("content-type")) || extFromUrl(url);
  const target = path.join(assetsDir, `${prefix}-${hash}${ext}`);
  await fsPromises.writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

async function downloadDocumentAssets(
  document: FeedDocument,
  assetsDir: string,
): Promise<FeedDocument> {
  fs.mkdirSync(assetsDir, { recursive: true });
  const existingFiles = fs.readdirSync(assetsDir);
  const clonedDocument: FeedDocument = {
    ...document,
    items: document.items.map((item) => ({
      ...item,
      author: { ...(item.author || {}) },
      content: { ...(item.content || {}) },
      stats: { ...(item.stats || {}) },
      thread: { ...(item.thread || {}) },
      media: Array.isArray(item.media)
        ? item.media.map((media) => ({ ...media }))
        : [],
      cards: Array.isArray(item.cards)
        ? item.cards.map((card) => ({ ...card }))
        : [],
      embedded_links: Array.isArray(item.embedded_links)
        ? item.embedded_links.map((link) => ({ ...link }))
        : [],
    })),
  };

  const jobs: Promise<void>[] = [];
  for (const item of clonedDocument.items) {
    if (item.author?.profile_image_url) {
      jobs.push(
        download(
          item.author.profile_image_url,
          `profile-${item.index}`,
          assetsDir,
          existingFiles,
        ).then((local) => {
          if (!local) {
            throw new Error(
              `Failed to materialize author profile image for item ${item.index}`,
            );
          }
          item.author.profile_image_local = local;
        }),
      );
    }
    const mediaItems = Array.isArray(item.media) ? item.media : [];
    for (const [index, media] of mediaItems.entries()) {
      if (media?.media_kind === "video" && media.download_video !== false) {
        jobs.push(
          Promise.resolve()
            .then(() =>
              downloadMediaVideo(item, media, assetsDir, existingFiles),
            )
            .then((local) => {
              if (!local) {
                throw new Error(
                  `Failed to materialize video asset for item ${item.index}`,
                );
              }
              media.local_video_src = local;
            }),
        );
      }
      if (media.src) {
        jobs.push(
          download(
            media.src,
            `media-${item.index}-${index + 1}`,
            assetsDir,
            existingFiles,
          ).then((local) => {
            if (!local) {
              throw new Error(
                `Failed to materialize media asset for item ${item.index}`,
              );
            }
            media.local_src = local;
          }),
        );
      }
    }
    const cards = Array.isArray(item.cards) ? item.cards : [];
    for (const [index, card] of cards.entries()) {
      if (card.image_url) {
        jobs.push(
          download(
            card.image_url,
            `card-${item.index}-${index + 1}`,
            assetsDir,
            existingFiles,
          ).then((local) => {
            if (!local) {
              throw new Error(
                `Failed to materialize card image for item ${item.index}`,
              );
            }
            card.image_local = local;
          }),
        );
      }
    }
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }

  return clonedDocument;
}

export { downloadDocumentAssets };
