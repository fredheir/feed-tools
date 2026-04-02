import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runSourceCapture } from "../lib/source-capture.js";
import { exportDocumentsFromDb, getDatabasePath } from "../lib/sqlite-store.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("runSourceCapture", () => {
  test("normalizes and persists merged source documents", async () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-test-"));
    tempDirs.push(saveDir);
    const seenOptions = [];

    const adapter = {
      name: "demo",
      async captureDocument(options) {
        seenOptions.push(options);
        return {
          captured_at: "2026-04-03T10:00:00Z",
          items: [
            {
              source_item_id: "42",
              url: "https://example.com/posts/42",
              content: { text: "hello world" },
              author: { handle: "@demo" },
              stats: { like: "9" },
            },
          ],
        };
      },
    };

    const document = await runSourceCapture(adapter, {
      saveDir,
      browserOptions: { session: "demo-session", autoConnect: false },
    });

    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0]).toMatchObject({
      limit: 12,
      browserOptions: {
        session: "demo-session",
        autoConnect: false,
      },
    });

    expect(document.source).toBe("demo");
    expect(document.items).toHaveLength(1);
    expect(document.items[0]).toMatchObject({
      id: "demo:42",
      source: "demo",
      source_item_id: "42",
      index: 1,
      content: { text: "hello world" },
      stats: { like: "9" },
      first_seen_at: "2026-04-03T10:00:00Z",
      last_seen_at: "2026-04-03T10:00:00Z",
      capture_count: 1,
    });
    expect(document.items[0]).not.toHaveProperty("text");
    expect(document.items[0]).not.toHaveProperty("profile_image_url");
    expect(document.items[0]).not.toHaveProperty("embedded_media");
    expect(document.items[0]).not.toHaveProperty("preview_cards");

    const currentPath = path.join(saveDir, "demo", "current.json");
    expect(fs.existsSync(currentPath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(currentPath, "utf8"));
    expect(persisted.items[0].id).toBe("demo:42");

    const dbPath = getDatabasePath(saveDir);
    expect(fs.existsSync(dbPath)).toBe(true);

    const exported = exportDocumentsFromDb(saveDir, { sources: ["demo"] });
    expect(exported).toEqual(document);
  });
});
