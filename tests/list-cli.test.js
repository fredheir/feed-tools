import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("feed-list", () => {
  test("prints a classification prompt for unclassified rows", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-list-test-"));
    tempDirs.push(dir);
    const inputPath = path.join(dir, "feed.json");
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
              author: { handle: "@classify" },
              content: { text: "Needs classification" },
              stats: { like: "3", share: "1", view: "12" },
              url: "https://x.com/classify/status/1",
            },
          ],
        },
        null,
        2,
      ),
    );

    const stdout = execFileSync(
      "node",
      ["./lib/list-cli.js", inputPath, "--unclassified"],
      {
        cwd: "/home/rolf/Projects/feed-tools",
        encoding: "utf8",
      },
    );

    expect(stdout).toContain("ERROR: classification step incomplete.");
    expect(stdout).toContain(
      "Requested categories: Friends and Family, Coding, Politics, Finance. Fallback: Other.",
    );
    expect(stdout).toContain("x\tx:1\t@classify\tNeeds classification");
    expect(stdout).toContain("https://x.com/classify/status/1");
  });
});
