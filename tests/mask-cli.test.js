import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { saveAllocation } from "../lib/allocation.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("feed-mask", () => {
  test("defaults to a derived mask path and pick=all behavior", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-mask-cli-"));
    tempDirs.push(saveDir);
    const inputPath = path.join(saveDir, "feed.json");
    const maskPath = path.join(saveDir, "feed.mask.json");
    const allocationPath = path.join(saveDir, "allocation.json");
    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        { id: "x:1", source: "x", content: { text: "A" } },
        { id: "x:2", source: "x", content: { text: "B" } },
      ],
    };
    fs.writeFileSync(inputPath, JSON.stringify(document, null, 2));
    saveAllocation(allocationPath, {
      version: 1,
      source: "x",
      items: {
        "x:1": { category: "Coding", updated_at: "2026-04-03T12:00:00Z" },
        "x:2": { category: "Politics", updated_at: "2026-04-03T12:00:00Z" },
      },
    });

    execFileSync(
      "node",
      ["./lib/mask-cli.js", inputPath, "--allocation", allocationPath],
      {
        cwd: "/home/rolf/Projects/feed-tools",
        encoding: "utf8",
      },
    );

    const mask = JSON.parse(fs.readFileSync(maskPath, "utf8"));
    expect(mask.tabs.map((tab) => tab.label)).toEqual(["Coding", "Politics"]);
    expect(mask.tabs[0].groups[0].item_ids).toEqual(["x:1"]);
    expect(mask.tabs[1].groups[0].item_ids).toEqual(["x:2"]);
  });
});
