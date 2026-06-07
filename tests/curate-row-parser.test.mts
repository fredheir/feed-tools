import { describe, expect, test } from "vitest";

import { parseCurateRows } from "../lib/curate-row-parser.ts";

describe("parseCurateRows", () => {
  test("ignores non-row context and parses tab-separated rows", () => {
    expect(
      parseCurateRows(
        [
          "/tmp/feed.json",
          "Render context:",
          "1\tid-1\tPolitics\t@a\tA post\tlikes=1 shares=2 views=3\thttps://example.test/1\thits:2",
          "2\tid-2\tOther\t@b\tAnother post\tlikes=0 shares=0 views=1\thttps://example.test/2",
        ].join("\n"),
      ),
    ).toEqual([
      {
        row: 1,
        source: null,
        id: "id-1",
        category: "Politics",
        author: "@a",
        text: "A post",
        stats: "likes=1 shares=2 views=3",
        url: "https://example.test/1",
        hits: 2,
        raw: "1\tid-1\tPolitics\t@a\tA post\tlikes=1 shares=2 views=3\thttps://example.test/1\thits:2",
      },
      {
        row: 2,
        source: null,
        id: "id-2",
        category: "Other",
        author: "@b",
        text: "Another post",
        stats: "likes=0 shares=0 views=1",
        url: "https://example.test/2",
        hits: null,
        raw: "2\tid-2\tOther\t@b\tAnother post\tlikes=0 shares=0 views=1\thttps://example.test/2",
      },
    ]);
  });

  test("parses classification-required rows", () => {
    expect(
      parseCurateRows(
        "3\tx\tid-3\t@c\tNeeds category\tlikes=5 shares=1 views=9\thttps://example.test/3",
        {
          classificationRequired: true,
        },
      ),
    ).toEqual([
      {
        row: 3,
        source: "x",
        id: "id-3",
        category: null,
        author: "@c",
        text: "Needs category",
        stats: "likes=5 shares=1 views=9",
        url: "https://example.test/3",
        hits: null,
        raw: "3\tx\tid-3\t@c\tNeeds category\tlikes=5 shares=1 views=9\thttps://example.test/3",
      },
    ]);
  });
});
