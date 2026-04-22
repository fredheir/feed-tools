import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  exportDocumentsFromDb,
  getDatabasePath,
  loadCurrentDocumentFromDb,
  loadAllocationFromDb,
  persistSourceDocument,
  saveAllocationToDb,
} from "../lib/sqlite-store.js";
import { DatabaseSync } from "node:sqlite";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("sqlite store", () => {
  test("exports combined documents in requested source order", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-db-"));
    tempDirs.push(saveDir);

    persistSourceDocument(saveDir, {
      sourceName: "x",
      document: {
        schema_version: 1,
        source: "x",
        captured_at: "2026-04-03T10:00:00Z",
        items: [{ id: "x:1", source: "x", content: { text: "from x" } }],
      },
    });
    persistSourceDocument(saveDir, {
      sourceName: "linkedin",
      document: {
        schema_version: 1,
        source: "linkedin",
        captured_at: "2026-04-03T11:00:00Z",
        items: [
          {
            id: "linkedin:1",
            source: "linkedin",
            content: { text: "from linkedin" },
          },
        ],
      },
    });

    const exported = exportDocumentsFromDb(saveDir, {
      sources: ["linkedin", "x"],
    });

    expect(exported.source).toBe("combined");
    expect(exported.captured_at).toBe("2026-04-03T11:00:00Z");
    expect(exported.items.map((item) => item.id)).toEqual([
      "linkedin:1",
      "x:1",
    ]);
  });

  test("can exclude seen and completed items from exported documents", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-db-"));
    tempDirs.push(saveDir);

    persistSourceDocument(saveDir, {
      sourceName: "x",
      document: {
        schema_version: 1,
        source: "x",
        captured_at: "2026-04-03T10:00:00Z",
        items: [
          { id: "x:1", source: "x", content: { text: "keep" } },
          { id: "x:2", source: "x", content: { text: "seen" } },
          { id: "x:3", source: "x", content: { text: "completed" } },
        ],
      },
    });

    const db = new DatabaseSync(getDatabasePath(saveDir));
    try {
      db.prepare(
        `UPDATE items SET is_seen = 1, seen_at = ? WHERE item_id = ?`,
      ).run("2026-04-03T12:00:00Z", "x:2");
      db.prepare(
        `UPDATE items SET is_completed = 1, completed_at = ? WHERE item_id = ?`,
      ).run("2026-04-03T12:05:00Z", "x:3");
    } finally {
      db.close();
    }

    const exported = exportDocumentsFromDb(saveDir, {
      sources: ["x"],
      excludeSeen: true,
      excludeCompleted: true,
    });

    expect(exported.items.map((item) => item.id)).toEqual(["x:1"]);
  });

  test("stores and loads item category allocations in sqlite", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-db-"));
    tempDirs.push(saveDir);

    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        { id: "x:1", source: "x", content: { text: "first" } },
        { id: "x:2", source: "x", content: { text: "second" } },
      ],
    };
    persistSourceDocument(saveDir, {
      sourceName: "x",
      document,
    });

    saveAllocationToDb(saveDir, document, {
      version: 1,
      source: "x",
      items: {
        "x:1": {
          category: "Coding",
          updated_at: "2026-04-03T12:00:00Z",
        },
      },
    });

    const allocation = loadAllocationFromDb(saveDir, document);
    expect(allocation).toEqual({
      version: 1,
      source: "x",
      items: {
        "x:1": {
          source: "x",
          category: "Coding",
          updated_at: "2026-04-03T12:00:00Z",
        },
      },
    });
  });

  test("normalizes stored documents at the sqlite boundary", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-db-"));
    tempDirs.push(saveDir);

    persistSourceDocument(saveDir, {
      sourceName: "x",
      document: {
        items: [
          {
            source_item_id: "post-1",
            text: "boundary text",
            url: "https://x.com/acme/status/1?utm_source=test",
            author: { handle: "acme" },
          },
        ],
      },
    });

    const stored = loadCurrentDocumentFromDb(saveDir, "x");

    expect(stored).not.toBeNull();
    expect(stored?.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(stored).toMatchObject({
      schema_version: 1,
      source: "x",
      items: [
        {
          id: "x:post-1",
          source: "x",
          source_item_id: "post-1",
          index: 1,
          url: "https://x.com/acme/status/1",
          author: {
            handle: "acme",
            display_name: null,
            profile_image_url: null,
            profile_image_local: null,
          },
          content: {
            text: "boundary text",
          },
          stats: {
            reply: null,
            share: null,
            like: null,
            view: null,
          },
          media: [],
          cards: [],
          thread: {
            has_thread_line: false,
            thread_line_height: null,
            thread_line_x: null,
            child_candidate_index: null,
            child_candidate_handle: null,
            child_candidate_url: null,
            relationship_confidence: null,
          },
          embedded_links: [],
          first_seen_at: null,
          last_seen_at: null,
          capture_count: null,
        },
      ],
    });
  });
});
