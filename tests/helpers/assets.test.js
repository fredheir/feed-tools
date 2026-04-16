import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { afterEach, describe, expect, test, vi } from "vitest";
import { downloadDocumentAssets } from "../../lib/assets.js";

const tempDirs = [];
const originalFetch = global.fetch;
const repoRoot = path.resolve(import.meta.dirname, "../..");

afterEach(() => {
  global.fetch = originalFetch;
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

    await downloadDocumentAssets(document, assetsDir);

    expect(document.items[0].author.profile_image_local).toContain(assetsDir);
    expect(document.items[0].media[0].local_src).toContain(assetsDir);
    expect(document.items[0].cards[0].image_local).toContain(assetsDir);
    expect(fs.existsSync(document.items[0].author.profile_image_local)).toBe(
      true,
    );
    expect(fs.existsSync(document.items[0].media[0].local_src)).toBe(true);
    expect(fs.existsSync(document.items[0].cards[0].image_local)).toBe(true);
  });

  test("falls back to placeholders or original urls when downloads fail", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

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

    await downloadDocumentAssets(document, assetsDir);

    expect(document.items[0].author.profile_image_local).toMatch(
      /^data:image\/svg\+xml/,
    );
    expect(document.items[0].media[0].local_src).toBe(
      "https://example.com/media.jpg",
    );
    expect(document.items[0].cards[0].image_local).toBe(
      "https://example.com/card",
    );
  });

  test("downloads local x video assets with yt-dlp when video media is present", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
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

    const downloadedVideo = path.join(assetsDir, "video-7-abcd1234.mp4");
    fs.writeFileSync(downloadedVideo, Uint8Array.from([1, 2, 3]));
    const execSpy = vi
      .spyOn(childProcess, "execFileSync")
      .mockImplementation(() => `${downloadedVideo}\n`);

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

    await downloadDocumentAssets(document, assetsDir);

    expect(execSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        "--cookies-from-browser",
        `chrome:${path.join(repoRoot, "chrome-profile", "Default")}`,
      ]),
      expect.any(Object),
    );
    expect(document.items[0].media[0].local_video_src).toBe(downloadedVideo);
    expect(document.items[0].media[0].local_src).toContain(assetsDir);
    expect(fs.existsSync(document.items[0].media[0].local_src)).toBe(true);
  });

  test("transcodes unsupported downloaded video codecs for browser playback", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
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

    const downloadedVideo = path.join(assetsDir, "video-3-abcd1234.mp4");
    const transcodedVideo = path.join(
      assetsDir,
      "video-3-abcd1234-browser.mp4",
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

    await downloadDocumentAssets(document, assetsDir);

    expect(document.items[0].media[0].local_video_src).toBe(transcodedVideo);
    expect(fs.existsSync(transcodedVideo)).toBe(true);
  });

  test("downloads direct video sources when media provides a video_src", async () => {
    const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-assets-"));
    tempDirs.push(assetsDir);
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
    vi.spyOn(childProcess, "execFileSync").mockImplementation(() => {
      throw new Error("yt-dlp disabled in tests");
    });

    const document = {
      items: [
        {
          index: 2,
          source: "tiktok",
          url: "https://www.tiktok.com/@demo/video/123",
          author: {},
          media: [
            {
              src: "https://example.com/cover.jpg",
              video_src: "https://example.com/video.mp4",
              href: "https://www.tiktok.com/@demo/video/123",
              media_kind: "video",
            },
          ],
          cards: [],
        },
      ],
    };

    await downloadDocumentAssets(document, assetsDir);

    expect(document.items[0].media[0].local_video_src).toContain(assetsDir);
    expect(document.items[0].media[0].local_video_src.endsWith(".mp4")).toBe(
      true,
    );
    expect(document.items[0].media[0].local_src).toContain(assetsDir);
  });
});
