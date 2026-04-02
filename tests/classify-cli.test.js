import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import {
  loadAllocationFromDb,
  persistSourceDocument,
} from "../lib/sqlite-store.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("feed-classify", () => {
  test("writes category assignments to sqlite", () => {
    const saveDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "feed-classify-test-"),
    );
    tempDirs.push(saveDir);
    const outputPath = path.join(saveDir, "workset.json");
    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          author: { handle: "@a" },
          content: { text: "A" },
          stats: {},
        },
      ],
    };

    persistSourceDocument(saveDir, {
      sourceName: "x",
      document,
    });
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8",
    );

    execFileSync(
      "node",
      ["./lib/classify-cli.js", outputPath, "--category", "Politics:1"],
      {
        cwd: "/home/rolf/Projects/feed-tools",
        encoding: "utf8",
      },
    );

    const allocation = loadAllocationFromDb(saveDir, document);
    expect(allocation.items["x:1"].category).toBe("Politics");
  });
});
