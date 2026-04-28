import { describe, expect, test } from "vitest";
import {
  extractFacebookSourceItemId,
  isFacebookItemWorthKeeping,
  normalizeFacebookExtractionDocument,
  scoreFacebookItemQuality,
} from "../sources/facebook/capture.ts";
import { canonicalizeItemUrl } from "../lib/item-shape.ts";
import { readFixture } from "./helpers/cli-config.mts";

describe("extractFacebookSourceItemId", () => {
  test("extracts profile post identifiers", () => {
    expect(
      extractFacebookSourceItemId(
        "https://www.facebook.com/joerg.d.fischer/posts/pfbid02Example123/?__tn__=-R",
      ),
    ).toBe("posts:pfbid02Example123");
  });

  test("extracts photo identifiers", () => {
    expect(
      extractFacebookSourceItemId(
        "https://www.facebook.com/photo/?fbid=10237530311591191&set=pcb.10237530313511239",
      ),
    ).toBe("photo:10237530311591191");
  });

  test("extracts permalink identifiers", () => {
    expect(
      extractFacebookSourceItemId(
        "https://www.facebook.com/permalink.php?story_fbid=123456789&id=42",
      ),
    ).toBe("permalink:123456789");
  });

  test("extracts group permalink identifiers", () => {
    expect(
      extractFacebookSourceItemId(
        "https://www.facebook.com/groups/123/permalink/987654321/",
      ),
    ).toBe("groups:987654321");
  });

  test("extracts watch identifiers from query strings", () => {
    expect(
      extractFacebookSourceItemId("https://www.facebook.com/watch/?v=13579"),
    ).toBe("watch:13579");
  });

  test("unwraps l.facebook redirects", () => {
    expect(
      extractFacebookSourceItemId(
        "https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Freel%2F987654321%2F",
      ),
    ).toBe("reel:987654321");
  });

  test("extracts ids from facebook plugin embed urls", () => {
    expect(
      extractFacebookSourceItemId(
        "https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Falexander.etkind%2Fposts%2Fpfbid0TQKi5xS119xFbjZtcFVBoZjMX4qiWq3ZWEpe5gACXNi4E3obo6tnxUqVe77rTDD7l&show_text=true&width=500",
      ),
    ).toBe(
      "posts:pfbid0TQKi5xS119xFbjZtcFVBoZjMX4qiWq3ZWEpe5gACXNi4E3obo6tnxUqVe77rTDD7l",
    );
  });

  test("ignores generic profile links", () => {
    expect(extractFacebookSourceItemId("https://www.facebook.com/rolfef")).toBe(
      null,
    );
  });
});

describe("facebook url canonicalization", () => {
  test("unwraps facebook plugin post href values", () => {
    expect(
      canonicalizeItemUrl(
        "facebook",
        "https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Falexander.etkind%2Fposts%2Fpfbid0TQKi5xS119xFbjZtcFVBoZjMX4qiWq3ZWEpe5gACXNi4E3obo6tnxUqVe77rTDD7l&show_text=true&width=500",
      ),
    ).toBe(
      "https://www.facebook.com/alexander.etkind/posts/pfbid0TQKi5xS119xFbjZtcFVBoZjMX4qiWq3ZWEpe5gACXNi4E3obo6tnxUqVe77rTDD7l",
    );
  });
});

describe("facebook item quality", () => {
  test("keeps strong synthetic facebook items with real content", () => {
    const item = {
      author: { handle: "Joerg D Fischer" },
      content: {
        text: "Der syrische Islamist Al-Scharaa praesentiert sich beim Staatsbesuch in Berlin und London mit einer Patek Philippe 5236P Uhr fuer rund 145.000 Euro.",
      },
      stats: { like: "60", reply: "6", share: "1" },
      media: [{ src: "https://example.com/image.jpg" }],
      cards: [],
      source_item_id: null,
    };

    expect(scoreFacebookItemQuality(item)).toBeGreaterThanOrEqual(4);
    expect(isFacebookItemWorthKeeping(item)).toBe(true);
  });

  test("drops recommendation modules without a real post", () => {
    const item = {
      author: { handle: "People you may know" },
      content: {
        text: "People you may know Sam Hayes 15 mutual friends Add friend Raitis Ralfs Vecmanis Add friend",
      },
      stats: {},
      media: [],
      cards: [],
      source_item_id: null,
    };

    expect(scoreFacebookItemQuality(item)).toBeLessThan(4);
    expect(isFacebookItemWorthKeeping(item)).toBe(false);
  });

  test("keeps real social posts with activity-style author headings", () => {
    const item = {
      author: {
        handle: "Sam Nallen Copley",
      },
      content: {
        text: "Training in the mountains - Mawashi geri",
      },
      stats: { like: "4" },
      media: [],
      cards: [],
      source_item_id: null,
    };

    expect(isFacebookItemWorthKeeping(item)).toBe(true);
  });

  test("real-browser snapshot fixture still exposes parser signals", () => {
    const snapshot = readFixture("facebook", "snapshot.txt");

    expect(snapshot).toContain('heading "Feed posts" [level=3');
    expect(snapshot).toContain('button "Like"');
    expect(snapshot).toContain('button "Leave a comment"');
    expect(snapshot).toContain(
      'button "Send this to friends or post it on your profile."',
    );
    expect(snapshot).toContain('heading "Sponsored" [level=3');
  });
});

describe("facebook CiC extraction normalisation", () => {
  test("canonicalizes extracted items and derives source ids", () => {
    const document = normalizeFacebookExtractionDocument({
      captured_at: "2026-04-28T05:00:00Z",
      items: [
        {
          source: "facebook",
          index: 1,
          url: "https://www.facebook.com/rolfef/posts/pfbid123/?__tn__=-R",
          author: {
            handle: "Rolf",
            display_name: "Rolf",
            profile_image_url: "https://example.com/profile.jpg",
          },
          content: {
            text: "This is a real Facebook post extracted from the rendered DOM.",
          },
          stats: { like: "10", reply: "2", share: "1", view: null },
          media: [],
          cards: [],
          embedded_links: [],
          thread: {
            has_thread_line: false,
            thread_line_height: null,
            thread_line_x: null,
          },
        },
      ],
    });

    expect(document.source).toBe("facebook");
    expect(document.captured_at).toBe("2026-04-28T05:00:00Z");
    expect(document.items).toHaveLength(1);
    expect(document.items[0].source_item_id).toBe("posts:pfbid123");
    expect(document.items[0].url).toBe(
      "https://www.facebook.com/rolfef/posts/pfbid123",
    );
  });
});
