import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { backfillSqliteFromCurrentJson } from "../lib/backfill-sqlite.js";
import { exportDocumentsFromDb } from "../lib/sqlite-store.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("backfillSqliteFromCurrentJson", () => {
  test("loads current.json files into sqlite export state", () => {
    const saveDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "feed-tools-backfill-"),
    );
    tempDirs.push(saveDir);

    const sourceDir = path.join(saveDir, "x");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "current.json"),
      JSON.stringify(
        {
          schema_version: 1,
          source: "x",
          captured_at: "2026-04-03T10:00:00Z",
          items: [
            {
              id: "x:1",
              source: "x",
              author: { handle: "@a" },
              content: { text: "backfilled" },
              stats: {},
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = backfillSqliteFromCurrentJson(saveDir, ["x", "linkedin"]);
    expect(result.backfilled).toHaveLength(1);
    expect(result.missing).toHaveLength(1);

    const exported = exportDocumentsFromDb(saveDir, { sources: ["x"] });
    expect(exported.items[0].content.text).toBe("backfilled");
  });
});
