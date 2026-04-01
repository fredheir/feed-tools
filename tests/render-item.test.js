import { describe, expect, test } from "vitest";
import { renderItemCard } from "../lib/render-item.js";

describe("renderItemCard", () => {
  test("renders generic feed card markup from normalized stats", () => {
    const html = renderItemCard({
      id: "linkedin:1",
      source: "linkedin",
      index: 1,
      url: "https://www.linkedin.com/feed/update/1/",
      author: { handle: "Jane Doe" },
      content: { text: "Shipping a new adapter." },
      stats: { reply: "12", share: "5", like: "44", view: "900" },
      media: [],
      cards: [],
      thread: {},
    });

    expect(html).toContain('class="feed-card source-linkedin"');
    expect(html).toContain("LinkedIn");
    expect(html).toContain("Shipping a new adapter.");
    expect(html).toContain("12");
    expect(html).toContain("900");
  });
});
