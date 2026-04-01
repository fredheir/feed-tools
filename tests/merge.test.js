import { describe, expect, test } from "vitest";
import { mergeDocuments } from "../lib/merge.js";
import { resolveSelectionList } from "../lib/selection.js";

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
          content: { text: "old" },
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
          content: { text: "new" },
        },
      ],
    };

    const merged = mergeDocuments(oldDoc, newDoc);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].content.text).toBe("new");
    expect(merged.items[0].capture_count).toBe(2);
    expect(merged.items[0].first_seen_at).toBe("2026-04-01T00:00:00Z");
    expect(merged.items[0].last_seen_at).toBe("2026-04-02T00:00:00Z");
  });

  test("drops legacy compatibility fields from merged output", () => {
    const oldDoc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          source_item_id: "1",
          index: 1,
          url: "a",
          reply_count: "5",
          embedded_media: [{ src: "old.jpg" }],
          preview_cards: [{ kind: "external_card", title: "old" }],
          profile_image_url: "https://example.com/old.jpg",
          thread_line_height: 88,
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
          source: "x",
          source_item_id: "1",
          index: 1,
          url: "a",
          author: {
            handle: "@x",
            profile_image_url: "https://example.com/new.jpg",
          },
          content: { text: "new" },
          stats: { reply: "7" },
          media: [{ src: "new.jpg" }],
          cards: [],
          thread: { has_thread_line: false },
          embedded_links: [],
        },
      ],
    };

    const merged = mergeDocuments(oldDoc, newDoc);
    expect(merged.items[0]).toMatchObject({
      id: "x:1",
      author: {
        handle: "@x",
        profile_image_url: "https://example.com/new.jpg",
      },
      content: { text: "new" },
      stats: { reply: "7" },
      media: [{ src: "new.jpg" }],
    });
    expect(merged.items[0]).not.toHaveProperty("reply_count");
    expect(merged.items[0]).not.toHaveProperty("embedded_media");
    expect(merged.items[0]).not.toHaveProperty("preview_cards");
    expect(merged.items[0]).not.toHaveProperty("profile_image_url");
    expect(merged.items[0]).not.toHaveProperty("thread_line_height");
  });

  test("does not overwrite distinct synthetic items that previously shared a row id", () => {
    const oldDoc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:row:2",
          source: "x",
          source_item_id: null,
          index: 2,
          author: { handle: "@shopatvalcero" },
          content: { text: "Don't throw your children's drawings away!" },
          embedded_links: [{ href: "https://shopvalcero.com/frame" }],
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
          source: "x",
          source_item_id: null,
          index: 2,
          author: { handle: "@typhooncon" },
          content: {
            text: "Don’t miss Connor Du Plooy at TyphoonCon 2026!",
          },
          embedded_links: [{ href: "https://typhooncon.com/2026-agenda/" }],
        },
      ],
    };

    const merged = mergeDocuments(oldDoc, newDoc);
    expect(merged.items).toHaveLength(2);
    expect(merged.items.map((item) => item.author.handle)).toContain(
      "@shopatvalcero",
    );
    expect(merged.items.map((item) => item.author.handle)).toContain(
      "@typhooncon",
    );
  });

  test("resolves row selections to stable item ids", () => {
    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:a",
          author: { handle: "@a" },
          content: { text: "A" },
          stats: {},
        },
        {
          id: "x:b",
          author: { handle: "@b" },
          content: { text: "B" },
          stats: {},
        },
      ],
    };

    expect(resolveSelectionList(document, "2,x:a")).toEqual(["x:b", "x:a"]);
  });

  test("prefers synthetic keys over generic linkedin company post urls", () => {
    const oldDoc = {
      schema_version: 1,
      source: "linkedin",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "linkedin:synthetic:aaa",
          source: "linkedin",
          url: "https://www.linkedin.com/company/linkedin/posts/",
          author: { handle: "LinkedIn" },
          content: { text: "first ad" },
          first_seen_at: "2026-04-01T00:00:00Z",
          last_seen_at: "2026-04-01T00:00:00Z",
          capture_count: 1,
        },
      ],
    };
    const newDoc = {
      schema_version: 1,
      source: "linkedin",
      captured_at: "2026-04-02T00:00:00Z",
      items: [
        {
          id: "linkedin:synthetic:bbb",
          source: "linkedin",
          url: "https://www.linkedin.com/company/linkedin/posts/",
          author: { handle: "LinkedIn" },
          content: { text: "second ad" },
        },
      ],
    };

    const merged = mergeDocuments(oldDoc, newDoc);
    expect(merged.items).toHaveLength(2);
  });
});
