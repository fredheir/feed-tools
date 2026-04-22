import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import childProcess from "node:child_process";
import { afterEach, describe, expect, test, vi } from "vitest";
import { downloadDocumentAssets } from "../../lib/assets.js";

const tempDirs = [];
const originalFetch = global.fetch;
const repoRoot = path.resolve(import.meta.dirname, "../..");
const originalPath = process.env.PATH || "";

function prependFakeBin(commands) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-bin-"));
  tempDirs.push(binDir);
  for (const command of commands) {
    fs.writeFileSync(path.join(binDir, command), "");
  }
  process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
}

function limitPathToFirstEntry() {
  process.env.PATH =
    String(process.env.PATH || "").split(path.delimiter)[0] || "";
}

function hashedAssetPath(assetsDir, prefix, url, ext = "mp4") {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return path.join(assetsDir, `${prefix}-${hash}.${ext}`);
}

afterEach(() => {
  global.fetch = originalFetch;
  process.env.PATH = originalPath;
  vi.restoreAllMocks();
  fs.rmSync(path.join(repoRoot, "chrome-profile"), {
    recursive: true,
    force: true,
  });
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("downloadDocumentAssets", () => {
  test("downloads author, media, and card assets into the assets directory", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get(name) {
          return name === "content-type" ? "image/png" : null;
        },
      },
      async arrayBuffer() {
        return Uint8Array.from([1, 2, 3]).buffer;
      },
    }));

    const document = {
      items: [
        {
          index: 1,
          author: { profile_image_url: "https://example.com/profile" },
          media: [{ src: "https://example.com/media.jpg" }],
          cards: [{ image_url: "https://example.com/card" }],
        },
      ],
    };

    const downloadedDocument = await downloadDocumentAssets(
      document,
      assetsDir,
    );

    expect(downloadedDocument.items[0].author.profile_image_local).toContain(
      assetsDir,
    );
    expect(downloadedDocument.items[0].media[0].local_src).toContain(assetsDir);
    expect(downloadedDocument.items[0].cards[0].image_local).toContain(
      assetsDir,
    );
    expect(
      fs.existsSync(downloadedDocument.items[0].author.profile_image_local),
    ).toBe(true);
    expect(fs.existsSync(downloadedDocument.items[0].media[0].local_src)).toBe(
      true,
    );
    expect(
      fs.existsSync(downloadedDocument.items[0].cards[0].image_local),
    ).toBe(true);
  });

  test("fails closed when asset downloads do not materialize local files", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    });

    const document = {
      items: [
        {
          index: 2,
          author: { profile_image_url: "https://example.com/profile" },
          media: [{ src: "https://example.com/media.jpg" }],
          cards: [{ image_url: "https://example.com/card" }],
        },
      ],
    };

    await expect(downloadDocumentAssets(document, assetsDir)).rejects.toThrow(
      /offline/,
    );
    expect(document.items[0].author.profile_image_local).toBeUndefined();
    expect(document.items[0].media[0].local_src).toBeUndefined();
    expect(document.items[0].cards[0].image_local).toBeUndefined();
  });

  test("does not leak partially materialized local fields on failure", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("profile")) {
        return {
          ok: true,
          headers: {
            get(name) {
              return name === "content-type" ? "image/png" : null;
            },
          },
          async arrayBuffer() {
            return Uint8Array.from([1, 2, 3]).buffer;
          },
        };
      }
      throw new Error("offline");
    });

    const document = {
      items: [
        {
          index: 3,
          author: { profile_image_url: "https://example.com/profile" },
          media: [{ src: "https://example.com/media.jpg" }],
          cards: [],
        },
      ],
    };

    await expect(downloadDocumentAssets(document, assetsDir)).rejects.toThrow(
      /offline/,
    );
    expect(document.items[0].author.profile_image_local).toBeUndefined();
    expect(document.items[0].media[0].local_src).toBeUndefined();
  });

  test("downloads local x video assets with yt-dlp when video media is present", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    prependFakeBin(["yt-dlp", "ffprobe", "ffmpeg"]);
    fs.mkdirSync(path.join(repoRoot, "chrome-profile", "Default"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(repoRoot, "chrome-profile", "Default", "Cookies"),
      "",
    );
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get(name) {
          return name === "content-type" ? "image/jpeg" : null;
        },
      },
      async arrayBuffer() {
        return Uint8Array.from([4, 5, 6]).buffer;
      },
    }));

    const downloadedVideo = hashedAssetPath(
      assetsDir,
      "video-7",
      "https://x.com/example/status/123",
    );
    fs.writeFileSync(downloadedVideo, Uint8Array.from([1, 2, 3]));
    vi.spyOn(childProcess, "execFileSync").mockImplementation(
      (command, args) => {
        const joined = [command, ...(args || [])].join(" ");
        if (joined.includes("after_move:filepath")) {
          return `${downloadedVideo}\n`;
        }
        if (joined.includes("-show_entries")) {
          return JSON.stringify({ streams: [{ codec_name: "h264" }] });
        }
        return "";
      },
    );

    const document = {
      items: [
        {
          index: 7,
          source: "x",
          url: "https://x.com/example/status/123",
          author: {},
          media: [
            {
              src: "https://pbs.twimg.com/ext_tw_video_thumb/123/img/poster.jpg",
              href: "https://x.com/example/status/123",
              media_kind: "video",
            },
          ],
          cards: [],
        },
      ],
    };

    const downloadedDocument = await downloadDocumentAssets(
      document,
      assetsDir,
    );

    expect(downloadedDocument.items[0].media[0].local_video_src).toBe(
      downloadedVideo,
    );
    expect(downloadedDocument.items[0].media[0].local_src).toContain(assetsDir);
    expect(fs.existsSync(downloadedDocument.items[0].media[0].local_src)).toBe(
      true,
    );
  });

  test("transcodes unsupported downloaded video codecs for browser playback", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    prependFakeBin(["yt-dlp", "ffprobe", "ffmpeg"]);
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get(name) {
          return name === "content-type" ? "image/jpeg" : null;
        },
      },
      async arrayBuffer() {
        return Uint8Array.from([4, 5, 6]).buffer;
      },
    }));

    const downloadedVideo = hashedAssetPath(
      assetsDir,
      "video-3",
      "https://www.tiktok.com/@demo/video/123",
    );
    const transcodedVideo = path.join(
      assetsDir,
      `${path.parse(downloadedVideo).name}-browser.mp4`,
    );
    fs.writeFileSync(downloadedVideo, Uint8Array.from([1, 2, 3]));

    vi.spyOn(childProcess, "execFileSync").mockImplementation(
      (command, args) => {
        const joined = [command, ...(args || [])].join(" ");
        if (joined.includes("after_move:filepath")) {
          return `${downloadedVideo}\n`;
        }
        if (joined.includes("-show_entries")) {
          return JSON.stringify({ streams: [{ codec_name: "hevc" }] });
        }
        if (joined.includes("-c:v libx264")) {
          fs.writeFileSync(transcodedVideo, Uint8Array.from([7, 8, 9]));
          return "";
        }
        return "";
      },
    );

    const document = {
      items: [
        {
          index: 3,
          source: "tiktok",
          url: "https://www.tiktok.com/@demo/video/123",
          author: {},
          media: [
            {
              src: "https://example.com/cover.jpg",
              href: "https://www.tiktok.com/@demo/video/123",
              media_kind: "video",
            },
          ],
          cards: [],
        },
      ],
    };

    const downloadedDocument = await downloadDocumentAssets(
      document,
      assetsDir,
    );

    expect(downloadedDocument.items[0].media[0].local_video_src).toBe(
      transcodedVideo,
    );
    expect(fs.existsSync(transcodedVideo)).toBe(true);
  });

  test("downloads direct video sources when media provides a video_src", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    prependFakeBin(["yt-dlp", "ffprobe", "ffmpeg"]);
    global.fetch = vi.fn(async (url) => ({
      ok: true,
      headers: {
        get(name) {
          if (name !== "content-type") return null;
          return String(url).includes(".mp4") ? "video/mp4" : "image/jpeg";
        },
      },
      async arrayBuffer() {
        return Uint8Array.from([7, 8, 9]).buffer;
      },
    }));
    vi.spyOn(childProcess, "execFileSync").mockImplementation(
      (command, args) => {
        const joined = [command, ...(args || [])].join(" ");
        if (joined.includes("-show_entries")) {
          return JSON.stringify({ streams: [{ codec_name: "h264" }] });
        }
        throw new Error("yt-dlp disabled in tests");
      },
    );

    const document = {
      items: [
        {
          index: 2,
          source: "tiktok",
          url: null,
          author: {},
          media: [
            {
              src: "https://example.com/cover.jpg",
              video_src: "https://example.com/video.mp4",
              media_kind: "video",
            },
          ],
          cards: [],
        },
      ],
    };

    const downloadedDocument = await downloadDocumentAssets(
      document,
      assetsDir,
    );

    expect(downloadedDocument.items[0].media[0].local_video_src).toContain(
      assetsDir,
    );
    expect(
      downloadedDocument.items[0].media[0].local_video_src.endsWith(".mp4"),
    ).toBe(true);
    expect(downloadedDocument.items[0].media[0].local_src).toContain(assetsDir);
  });

  test("fails when video probe cannot establish browser-playable output", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    prependFakeBin(["yt-dlp"]);
    limitPathToFirstEntry();

    const downloadedVideo = hashedAssetPath(
      assetsDir,
      "video-5",
      "https://www.tiktok.com/@demo/video/123",
    );
    fs.writeFileSync(downloadedVideo, Uint8Array.from([1, 2, 3]));
    vi.spyOn(childProcess, "execFileSync").mockImplementation(() => {
      return `${downloadedVideo}\n`;
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get(name) {
          return name === "content-type" ? "image/jpeg" : null;
        },
      },
      async arrayBuffer() {
        return Uint8Array.from([4, 5, 6]).buffer;
      },
    }));

    const document = {
      items: [
        {
          index: 5,
          source: "tiktok",
          url: "https://www.tiktok.com/@demo/video/123",
          author: {},
          media: [
            {
              src: "https://example.com/cover.jpg",
              href: "https://www.tiktok.com/@demo/video/123",
              media_kind: "video",
            },
          ],
          cards: [],
        },
      ],
    };

    await expect(downloadDocumentAssets(document, assetsDir)).rejects.toThrow(
      /ffprobe is unavailable/,
    );
  });
});
