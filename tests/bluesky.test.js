import { describe, expect, test } from "vitest";
import {
  extractBlueskySourceItemId,
  normalizeBlueskyExtractionDocument,
} from "../sources/bluesky/capture.js";
import { renderItemCard } from "../lib/render/item.js";
import { getCaptureHandler } from "../lib/source-registry.js";
import { isSupportedSource } from "../lib/source-catalog.js";
import { readFixture } from "./helpers/cli-config.mts";

describe("bluesky support", () => {
  test("extracts stable source ids from bluesky post urls", () => {
    expect(
      extractBlueskySourceItemId(
        "https://bsky.app/profile/mrjamesob.bsky.social/post/3miirem2nd22e",
      ),
    ).toBe("mrjamesob.bsky.social/post/3miirem2nd22e");
  });

  test("registers bluesky as a supported source", () => {
    expect(isSupportedSource("bluesky")).toBe(true);
    expect(typeof getCaptureHandler("bluesky")).toBe("function");
  });

  test("renders bluesky cards with the platform metadata", () => {
    const html = renderItemCard({
      id: "bluesky:mrjamesob.bsky.social/post/3miirem2nd22e",
      source: "bluesky",
      index: 1,
      url: "https://bsky.app/profile/mrjamesob.bsky.social/post/3miirem2nd22e",
      author: {
        handle: "@mrjamesob.bsky.social",
        display_name: "James O’Brien",
      },
      content: { text: "If the stakes weren’t so high..." },
      stats: { reply: "68", share: "78", like: "518", view: null },
      media: [],
      cards: [],
      thread: {},
    });

    expect(html).toContain('class="feed-card source-bluesky"');
    expect(html).toContain("BlueSky");
    expect(html).toContain("@mrjamesob.bsky.social");
  });

  test("real-browser feed fixture still exposes extractor selectors", () => {
    const html = readFixture("bluesky", "article.html");

    expect(html).toContain("feedItem-by-");
    expect(html).toContain("replyBtn");
    expect(html).toContain("repostBtn");
    expect(html).toContain("likeBtn");
    expect(html).toContain("userAvatarImage");
    expect(html).toContain("/profile/");
    expect(html).toContain("/post/");
    expect(html).toContain("https://cdn.bsky.app/img/FIXTURE.jpg");
  });

  test("normalizes browser extraction output before merge/dedupe", () => {
    const document = normalizeBlueskyExtractionDocument({
      captured_at: "2026-04-22T10:00:00Z",
      items: [
        {
          source_item_id: "alice.bsky.social/post/abc123",
          url: "https://bsky.app/profile/alice.bsky.social/post/abc123",
          content: { text: "Hello from Bluesky" },
          author: { handle: "@alice.bsky.social" },
          stats: { like: "8" },
        },
      ],
    });

    expect(document).toMatchObject({
      source: "bluesky",
      captured_at: "2026-04-22T10:00:00Z",
      items: [
        {
          id: "bluesky:alice.bsky.social/post/abc123",
          source: "bluesky",
          source_item_id: "alice.bsky.social/post/abc123",
          index: 1,
          content: { text: "Hello from Bluesky" },
          stats: { like: "8" },
        },
      ],
    });
  });

  test("rejects malformed browser extraction payloads", () => {
    expect(() => normalizeBlueskyExtractionDocument({ items: "bad" })).toThrow(
      /Invalid bluesky extraction payload/,
    );
  });
});
