import { describe, expect, test } from "vitest";
import { renderDocument } from "../lib/render-html.js";

describe("renderDocument", () => {
  test("renders ads unchecked by default and platform filters checked", () => {
    const html = renderDocument({
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/1",
          author: { handle: "@a" },
          content: { text: "A" },
          stats: {},
          media: [],
          cards: [],
          thread: {},
        },
        {
          id: "linkedin:1",
          source: "linkedin",
          index: 2,
          url: "https://www.linkedin.com/feed/update/1/",
          author: { handle: "B" },
          content: { text: "B" },
          stats: {},
          media: [],
          cards: [],
          thread: {},
        },
      ],
      mask: {
        tabbed: false,
        tabs: [
          { label: "Coding", groups: [{ label: "Coding", item_ids: ["x:1"] }] },
          {
            label: "ADs",
            groups: [{ label: "ADs", item_ids: ["linkedin:1"] }],
          },
        ],
      },
    });

    expect(html).toContain('id="feed-tab-0" checked');
    expect(html).toContain('id="feed-tab-1" ');
    expect(html).not.toContain('id="feed-tab-1" checked');
    expect(html).toContain('id="feed-platform-0" checked');
    expect(html).toContain('id="feed-platform-1" checked');
    expect(html).toContain('class="platform-filter-group"');
  });
});
