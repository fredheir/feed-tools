import { describe, expect, test } from "vitest";
import {
  extractFacebookSourceItemId,
  isFacebookItemWorthKeeping,
  scoreFacebookItemQuality,
} from "../sources/facebook/capture.js";

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

  test("unwraps l.facebook redirects", () => {
    expect(
      extractFacebookSourceItemId(
        "https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Freel%2F987654321%2F",
      ),
    ).toBe("reel:987654321");
  });

  test("ignores generic profile links", () => {
    expect(extractFacebookSourceItemId("https://www.facebook.com/rolfef")).toBe(
      null,
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
});
