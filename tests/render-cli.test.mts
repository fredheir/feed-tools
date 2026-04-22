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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
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
      ["./lib/render-cli.js", inputPath, outputPath, "--no-open"],
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
});
