import { describe, expect, test } from "vitest";
import { mergeDocuments } from "../lib/merge.js";

describe("mergeDocuments", () => {
  test("deduplicates by stable id and increments capture metadata", () => {
    const oldDoc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          source_item_id: "1",
          index: 1,
          url: "a",
          text: "old",
          first_seen_at: "2026-04-01T00:00:00Z",
          last_seen_at: "2026-04-01T00:00:00Z",
          capture_count: 1,
        },
      ],
    };
    const newDoc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-02T00:00:00Z",
      items: [
        {
          id: "x:1",
          source_item_id: "1",
          index: 1,
          url: "a",
          text: "new",
        },
      ],
    };

    const merged = mergeDocuments(oldDoc, newDoc);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].text).toBe("new");
    expect(merged.items[0].capture_count).toBe(2);
    expect(merged.items[0].first_seen_at).toBe("2026-04-01T00:00:00Z");
    expect(merged.items[0].last_seen_at).toBe("2026-04-02T00:00:00Z");
  });
});
