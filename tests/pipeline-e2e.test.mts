import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  repoRoot,
  runCli,
  spawnCli,
  writeTestConfig,
} from "./helpers/cli-config.mts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("pipeline e2e", () => {
  test("ingests, classifies, curates, and renders a sqlite-backed workset", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-pipeline-e2e-"));
    tempDirs.push(dir);

    const saveDir = path.join(dir, "save");
    const worksetPath = path.join(dir, "workset.json");
    const htmlPath = path.join(dir, "feed.html");
    const capturePath = path.join(dir, "capture.json");
    const configPath = writeTestConfig(repoRoot, {
      user_preferences: {
        sources: [
          {
            name: "x",
            enabled: true,
            default: true,
            capture: {
              save_dir: saveDir,
              assets_dir: path.join(dir, "assets"),
              default_limit: 12,
              browser: {},
            },
          },
        ],
      },
    });

    fs.writeFileSync(
      capturePath,
      JSON.stringify(
        {
          schema_version: 1,
          source: "x",
          captured_at: "2026-04-18T10:00:00Z",
          items: [
            {
              source: "x",
              source_item_id: "123456789",
              index: 1,
              url: "https://x.com/testuser/status/123456789",
              author: {
                handle: "@testuser",
                display_name: "Test User",
                profile_image_url: null,
              },
              content: {
                text: "Golden pipeline coverage for feed tools",
              },
              stats: {
                reply: "1",
                share: "2",
                like: "5",
                view: "100",
              },
              media: [],
              cards: [],
              thread: {
                has_thread_line: false,
                thread_line_height: null,
                thread_line_x: null,
              },
              embedded_links: [],
            },
          ],
        },
        null,
        2,
      ),
    );

    const ingestOutput = runCli(
      "./lib/cic-capture-cli.js",
      ["ingest", "x", capturePath, "--save-dir", saveDir],
      configPath,
    );
    const merged = JSON.parse(ingestOutput) as {
      items: Array<{ id: string }>;
    };

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].id).toBe("x:123456789");
    expect(fs.existsSync(path.join(saveDir, "feed.sqlite"))).toBe(true);

    const firstCurate = spawnCli(
      "./lib/curate-cli.js",
      [worksetPath, "--save-dir", saveDir, "--source", "x"],
      configPath,
    );

    expect(firstCurate.status).toBe(2);
    expect(firstCurate.stdout).toContain(
      "ERROR: classification step incomplete.",
    );
    expect(firstCurate.stdout).toContain("x:123456789");
    expect(firstCurate.stdout).toContain(
      "Golden pipeline coverage for feed tools",
    );

    runCli(
      "./lib/classify-cli.js",
      [worksetPath, "--save-dir", saveDir, "--category", "Coding:1"],
      configPath,
    );

    const secondCurate = runCli(
      "./lib/curate-cli.js",
      [worksetPath, "--save-dir", saveDir, "--source", "x"],
      configPath,
    );

    expect(secondCurate).toContain("Coding");
    expect(secondCurate).toContain("x:123456789");

    runCli(
      "./lib/render-cli.js",
      [worksetPath, htmlPath, "--no-open"],
      configPath,
    );

    const html = fs.readFileSync(htmlPath, "utf8");
    expect(html).toContain("Golden pipeline coverage for feed tools");
    expect(html).toContain("Coding");
    expect(html).toContain("https://x.com/testuser/status/123456789");
  });
});
