import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import {
  persistSourceDocument,
  saveAllocationToDb,
} from "../lib/sqlite-store.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("feed-override", () => {
  test("prints recent sections plus topical hits from sqlite-backed state", () => {
    const saveDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "feed-override-test-"),
    );
    tempDirs.push(saveDir);
    const outputPath = path.join(saveDir, "override.json");
    const document = {
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          author: { handle: "@politics" },
          content: { text: "Trump says something again" },
          stats: { like: "11" },
          url: "https://x.com/politics/status/1",
        },
        {
          id: "bluesky:1",
          source: "bluesky",
          author: { handle: "@friend.bsky.social" },
          content: { text: "Family photo" },
          stats: { like: "5" },
          url: "https://bsky.app/profile/friend.bsky.social/post/1",
        },
      ],
    };
    persistSourceDocument(saveDir, {
      sourceName: "x",
      document: { ...document, source: "x", items: [document.items[0]] },
    });
    persistSourceDocument(saveDir, {
      sourceName: "bluesky",
      document: { ...document, source: "bluesky", items: [document.items[1]] },
    });
    saveAllocationToDb(
      saveDir,
      { source: "x", items: [document.items[0]] },
      {
        version: 1,
        source: "x",
        items: {
          "x:1": { category: "Politics", updated_at: "2026-04-03T12:00:00Z" },
        },
      },
    );
    saveAllocationToDb(
      saveDir,
      { source: "bluesky", items: [document.items[1]] },
      {
        version: 1,
        source: "bluesky",
        items: {
          "bluesky:1": {
            category: "Friends and Family",
            updated_at: "2026-04-03T12:00:00Z",
          },
        },
      },
    );

    const stdout = execFileSync(
      "node",
      [
        "./lib/override-cli.js",
        outputPath,
        "--save-dir",
        saveDir,
        "--matches",
        "trump,maga,white house,president",
      ],
      {
        cwd: "/home/rolf/Projects/feed-tools",
        encoding: "utf8",
      },
    );

    expect(stdout).toContain("Configured categories:");
    expect(stdout).toContain("Recent x:");
    expect(stdout).toContain("Recent bluesky:");
    expect(stdout).toContain(
      "Matches battery: trump, maga, white house, president.",
    );
    expect(stdout).toContain("Topical hits: page 1 size 10 of 1");
    expect(stdout).toContain("Adjacent candidates:");
    expect(stdout).toContain("Politics");
    expect(stdout).toContain("Friends and Family");
  });
});
