import { describe, expect, test } from "vitest";
import {
  extractLinkedInSourceItemId,
  isLinkedInItemWorthKeeping,
  scoreLinkedInItemQuality,
} from "../sources/linkedin/capture.js";
import { normalizeItemShape } from "../lib/item-shape.js";
import { readFixture } from "./helpers/cli-config.mts";

describe("extractLinkedInSourceItemId", () => {
  test("extracts feed update urns", () => {
    expect(
      extractLinkedInSourceItemId(
        "https://www.linkedin.com/feed/update/urn:li:ugcPost:7441813866675613696/?originTrackingId=abc",
      ),
    ).toBe("urn:li:ugcPost:7441813866675613696");
  });

  test("extracts pulse identifiers", () => {
    expect(
      extractLinkedInSourceItemId(
        "https://www.linkedin.com/pulse/some-article-slug/",
      ),
    ).toBe("pulse:some-article-slug");
  });

  test("ignores generic company post listing urls", () => {
    expect(
      extractLinkedInSourceItemId(
        "https://www.linkedin.com/company/linkedin/posts/",
      ),
    ).toBe(null);
  });

  test("sanitizes generic company listing ids into synthetic ids", () => {
    const item = normalizeItemShape({
      source: "linkedin",
      id: "linkedin:/company/linkedin/posts/",
      source_item_id: "/company/linkedin/posts/",
      index: 1,
      author: { handle: "LinkedIn" },
      content: { text: "Promoted listing" },
      url: "https://www.linkedin.com/company/linkedin/posts/",
    });

    expect(item.source_item_id).toBe(null);
    expect(item.id.startsWith("linkedin:synthetic:")).toBe(true);
  });

  test("keeps strong synthetic linkedin items with real content", () => {
    const item = {
      author: { handle: "LinkedIn" },
      content: {
        text: "Exploring new job opportunities? Learn more about open roles and career paths.",
      },
      stats: { like: "4113", share: "48" },
      media: [{ src: "https://example.com/image.jpg" }],
      cards: [],
      source_item_id: null,
    };

    expect(scoreLinkedInItemQuality(item)).toBeGreaterThanOrEqual(4);
    expect(isLinkedInItemWorthKeeping(item)).toBe(true);
  });

  test("drops weak feed-chrome linkedin items without permalink", () => {
    const item = {
      author: { handle: "Daria Shepetko" },
      content: {
        text: "Feed post\nDaria Shepetko loves this",
      },
      stats: {},
      media: [],
      cards: [],
      source_item_id: null,
    };

    expect(scoreLinkedInItemQuality(item)).toBeLessThan(4);
    expect(isLinkedInItemWorthKeeping(item)).toBe(false);
  });

  test("real-browser snapshot fixture still exposes feed extraction signals", () => {
    const snapshot = readFixture("linkedin", "snapshot.txt");

    expect(snapshot).toContain('button "Start a post"');
    expect(snapshot).toContain('heading "Feed post" [level=2');
    expect(snapshot).toContain('button "Open control menu for post');
    expect(snapshot).toContain('button "Comment"');
    expect(snapshot).toContain('button "Repost"');
    expect(snapshot).toContain('link "Send"');
    expect(snapshot).toContain("Visibility: Global");
  });
});
