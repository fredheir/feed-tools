import { describe, expect, test } from "vitest";
import { applyMask } from "../lib/mask.js";

describe("applyMask", () => {
  test("rejects documents without an items array", () => {
    expect(() => applyMask(null, { item_ids: ["x:1"] })).toThrow(
      "Expected standardized feed document with .items array",
    );
  });

  test("filters by stable item id", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        { id: "x:1", source_item_id: "1", index: 1, url: "a" },
        { id: "x:2", source_item_id: "2", index: 2, url: "b" },
      ],
    };

    const masked = applyMask(doc, { item_ids: ["x:2"] });
    expect(masked.items).toHaveLength(1);
    expect(masked.items[0].id).toBe("x:2");
  });

  test("keeps tab metadata when selecting grouped item ids", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        { id: "x:1", source_item_id: "1", index: 1, url: "a" },
        { id: "x:2", source_item_id: "2", index: 2, url: "b" },
      ],
    };

    const masked = applyMask(doc, {
      tabs: [
        {
          label: "Coding",
          groups: [{ label: "Coding", item_ids: ["x:2"] }],
        },
      ],
    });

    expect(masked.mask.tabs[0].label).toBe("Coding");
    expect(masked.items).toHaveLength(1);
    expect(masked.items[0].id).toBe("x:2");
  });

  test("expands direct item selection to include the whole connected thread", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          index: 1,
          url: "https://x.com/a/status/1",
          thread: {
            child_candidate_index: 2,
            child_candidate_url: "https://x.com/a/status/2",
          },
        },
        {
          id: "x:2",
          index: 2,
          url: "https://x.com/a/status/2",
          thread: {
            child_candidate_index: 3,
            child_candidate_url: "https://x.com/a/status/3",
          },
        },
        {
          id: "x:3",
          index: 3,
          url: "https://x.com/a/status/3",
          thread: {},
        },
      ],
    };

    const masked = applyMask(doc, { item_ids: ["x:2"] });

    expect(masked.items.map((item) => item.id)).toEqual(["x:1", "x:2", "x:3"]);
    expect(masked.mask.item_ids).toEqual(["x:1", "x:2", "x:3"]);
  });

  test("expands grouped tab selections to include the whole connected thread", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          index: 1,
          url: "https://x.com/a/status/1",
          thread: {
            child_candidate_index: 2,
            child_candidate_url: "https://x.com/a/status/2",
          },
        },
        {
          id: "x:2",
          index: 2,
          url: "https://x.com/a/status/2",
          thread: {},
        },
      ],
    };

    const masked = applyMask(doc, {
      tabs: [
        {
          label: "Politics",
          groups: [{ label: "Politics", item_ids: ["x:1"] }],
        },
      ],
    });

    expect(masked.items.map((item) => item.id)).toEqual(["x:1", "x:2"]);
    expect(masked.mask.tabs[0].groups[0].item_ids).toEqual(["x:1", "x:2"]);
  });

  test("does not cross-link unrelated items when duplicate indices exist across sources", () => {
    const doc = {
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/1",
          thread: {
            child_candidate_index: 2,
          },
        },
        {
          id: "x:2",
          source: "x",
          index: 2,
          url: "https://x.com/a/status/2",
          thread: {},
        },
        {
          id: "facebook:1",
          source: "facebook",
          index: 1,
          url: "https://facebook.com/posts/1",
          thread: {
            child_candidate_index: 2,
          },
        },
        {
          id: "facebook:2",
          source: "facebook",
          index: 2,
          url: "https://facebook.com/posts/2",
          thread: {},
        },
      ],
    };

    const masked = applyMask(doc, { item_ids: ["x:1"] });

    expect(masked.items.map((item) => item.id)).toEqual(["x:1", "x:2"]);
    expect(masked.mask.item_ids).toEqual(["x:1", "x:2"]);
  });

  test("skips ambiguous index fallback links when duplicate indices exist within a source", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:new",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/new",
          thread: {
            child_candidate_index: 2,
          },
        },
        {
          id: "x:child-a",
          source: "x",
          index: 2,
          url: "https://x.com/a/status/2",
          thread: {},
        },
        {
          id: "x:child-b",
          source: "x",
          index: 2,
          url: "https://x.com/b/status/2",
          thread: {},
        },
      ],
    };

    const masked = applyMask(doc, { item_ids: ["x:new"] });

    expect(masked.items.map((item) => item.id)).toEqual(["x:new"]);
    expect(masked.mask.item_ids).toEqual(["x:new"]);
  });

  test("preserves explicit selection order across sources when expanding masks", () => {
    const doc = {
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "facebook:1",
          source: "facebook",
          index: 1,
          url: "https://facebook.com/posts/1",
          thread: {},
        },
        {
          id: "x:1",
          source: "x",
          index: 2,
          url: "https://x.com/a/status/1",
          thread: {},
        },
        {
          id: "bluesky:1",
          source: "bluesky",
          index: 3,
          url: "https://bsky.app/profile/a/post/1",
          thread: {},
        },
      ],
    };

    const masked = applyMask(doc, {
      tabs: [
        {
          label: "Politics",
          groups: [
            {
              label: "Politics",
              item_ids: ["bluesky:1", "x:1", "facebook:1"],
            },
          ],
        },
      ],
    });

    expect(masked.items.map((item) => item.id)).toEqual([
      "bluesky:1",
      "x:1",
      "facebook:1",
    ]);
    expect(masked.mask.tabs[0].groups[0].item_ids).toEqual([
      "bluesky:1",
      "x:1",
      "facebook:1",
    ]);
  });

  test("rejects masks that mix top-level item_ids and tabs", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [{ id: "x:1", source: "x", index: 1, url: "a", thread: {} }],
    };

    expect(() =>
      applyMask(doc, {
        item_ids: ["x:1"],
        tabs: [
          { label: "Coding", groups: [{ label: "Coding", item_ids: ["x:1"] }] },
        ],
      }),
    ).toThrow("FeedMask cannot contain both item_ids and tabs");
  });

  test("expands grouped selections using index-based thread links in the stored order", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:reply",
          source: "x",
          index: 2,
          url: "https://x.com/a/status/2",
          thread: {},
        },
        {
          id: "x:root",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/1",
          thread: {
            child_candidate_index: 2,
          },
        },
      ],
    };

    const masked = applyMask(doc, {
      tabs: [
        {
          label: "Thread",
          groups: [{ label: "Thread", item_ids: ["x:reply"] }],
        },
      ],
    });

    expect(masked.items.map((item) => item.id)).toEqual(["x:root", "x:reply"]);
    expect(masked.mask.tabs[0].groups[0].item_ids).toEqual([
      "x:root",
      "x:reply",
    ]);
  });
});
