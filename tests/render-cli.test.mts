import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  repoRoot,
  withConfigEnv,
  writeTestConfig,
} from "./helpers/cli-config.mts";

const tempDirs: string[] = [];
const tempFiles: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const file of tempFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

describe("feed-render", () => {
  test("ignores an adjacent mask file when rendering", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-render-cli-"));
    tempDirs.push(dir);
    const configPath = writeTestConfig(repoRoot);
    const inputPath = path.join(dir, "feed.json");
    const maskPath = path.join(dir, "feed.mask.json");
    const outputPath = path.join(dir, "feed.html");

    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        {
          schema_version: 1,
          source: "x",
          captured_at: "2026-04-03T10:00:00Z",
          items: [
            {
              id: "x:1",
              source: "x",
              index: 1,
              url: "https://x.com/a/status/1",
              author: { handle: "@a" },
              content: { text: "A" },
              stats: {},
              media: [],
              cards: [],
              thread: {},
            },
            {
              id: "x:2",
              source: "x",
              index: 2,
              url: "https://x.com/a/status/2",
              author: { handle: "@b" },
              content: { text: "B" },
              stats: {},
              media: [],
              cards: [],
              thread: {},
            },
          ],
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      maskPath,
      JSON.stringify(
        {
          tabs: [
            {
              label: "Coding",
              groups: [{ label: "Coding", item_ids: ["x:2"] }],
            },
          ],
        },
        null,
        2,
      ),
    );

    execFileSync(
      process.execPath,
      ["./bin/feed-render", inputPath, outputPath, "--no-open"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    const html = fs.readFileSync(outputPath, "utf8");
    expect(html).not.toContain("Coding");
    expect(html).toContain("A");
    expect(html).toContain("B");
  });

  test("falls back to remote media when referenced local assets are missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-render-cli-"));
    tempDirs.push(dir);
    const configPath = writeTestConfig(repoRoot);
    const inputPath = path.join(dir, "feed.json");
    const outputPath = path.join(dir, "feed.html");

    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        {
          schema_version: 1,
          source: "youtube",
          captured_at: "2026-04-22T10:00:00Z",
          items: [
            {
              id: "youtube:1",
              source: "youtube",
              index: 1,
              url: "https://www.youtube.com/watch?v=demo",
              author: {
                handle: "Demo",
                profile_image_local: "var/missing-profile.jpg",
                profile_image_url: "https://example.com/profile.jpg",
              },
              content: { text: "Demo" },
              stats: {},
              media: [
                {
                  local_src: "var/missing-thumb.jpg",
                  src: "https://example.com/thumb.jpg",
                  href: "https://www.youtube.com/watch?v=demo",
                  media_kind: "image",
                },
              ],
              cards: [],
              thread: {},
            },
          ],
        },
        null,
        2,
      ),
    );

    execFileSync(
      process.execPath,
      ["./bin/feed-render", inputPath, outputPath, "--no-open"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    const html = fs.readFileSync(outputPath, "utf8");
    expect(html).toContain('src="https://example.com/thumb.jpg"');
    expect(html).not.toContain('src="var/missing-thumb.jpg"');
    expect(html).toContain('src="https://example.com/profile.jpg"');
  });

  test("prefers sibling export assets over repo-shadowed relative paths", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-render-cli-"));
    tempDirs.push(dir);
    const configPath = writeTestConfig(repoRoot);
    const inputPath = path.join(dir, "feed.json");
    const outputPath = path.join(dir, "feed.html");
    const siblingAssetDir = path.join(dir, "var");
    const siblingAssetPath = path.join(siblingAssetDir, "render-shadow.jpg");
    const repoAssetPath = path.join(repoRoot, "var", "render-shadow.jpg");
    fs.mkdirSync(siblingAssetDir, { recursive: true });
    fs.writeFileSync(siblingAssetPath, "sibling");
    fs.writeFileSync(repoAssetPath, "repo");
    tempFiles.push(repoAssetPath);

    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        {
          schema_version: 1,
          source: "x",
          captured_at: "2026-04-22T10:00:00Z",
          items: [
            {
              id: "x:1",
              source: "x",
              index: 1,
              url: "https://x.com/a/status/1",
              author: {
                handle: "@a",
                profile_image_local: "var/render-shadow.jpg",
              },
              content: { text: "A" },
              stats: {},
              media: [],
              cards: [],
              thread: {},
            },
          ],
        },
        null,
        2,
      ),
    );

    execFileSync(
      process.execPath,
      ["./bin/feed-render", inputPath, outputPath, "--no-open"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    const html = fs.readFileSync(outputPath, "utf8");
    expect(html).toContain('src="var/render-shadow.jpg"');
    expect(html).not.toContain(repoRoot.replaceAll("&", "&amp;"));
  });
});
