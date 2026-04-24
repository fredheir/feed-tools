import { describe, expect, test } from "vitest";
import { renderDocument } from "../../lib/render/html.js";

describe("renderDocument", () => {
  test("renders app-style shell chrome around the feed", () => {
    const html = renderDocument({
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [],
    });

    expect(html).toContain('class="app-topbar"');
    expect(html).toContain("Your Feed");
    expect(html).toContain('class="feed-briefing"');
    expect(html).toContain("0 sources");
  });

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

  test("keeps an ads-only tab visible on first render", () => {
    const html = renderDocument({
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "linkedin:1",
          source: "linkedin",
          index: 1,
          url: "https://www.linkedin.com/feed/update/1/",
          author: { handle: "B" },
          content: { text: "Ad post" },
          stats: {},
          media: [],
          cards: [],
          thread: {},
        },
      ],
      mask: {
        tabbed: true,
        tabs: [
          {
            label: "Ads",
            groups: [{ label: "Ads", item_ids: ["linkedin:1"] }],
          },
        ],
      },
    });

    expect(html).toContain('id="feed-tab-0" checked');
    expect(html).toContain("Ad post");
  });

  test("renders legacy tab masks that use tab-level item_ids", () => {
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
          content: { text: "Legacy tab item" },
          stats: {},
          media: [],
          cards: [],
          thread: {},
        },
      ],
      mask: {
        tabbed: true,
        tabs: [{ label: "Coding", item_ids: ["x:1"] }],
      },
    });

    expect(html).toContain("Legacy tab item");
    expect(html).toContain('class="tab-panel tab-panel-0"');
    expect(html).toContain('class="group-block"');
  });

  test("renders threaded x replies after the original post", () => {
    const html = renderDocument({
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:reply",
          source: "x",
          index: 2,
          url: "https://x.com/a/status/2",
          author: { handle: "@a" },
          content: { text: "Reply" },
          stats: {},
          media: [],
          cards: [],
          thread: {},
        },
        {
          id: "x:root",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/1",
          author: { handle: "@a" },
          content: { text: "Original" },
          stats: {},
          media: [],
          cards: [],
          thread: {
            child_candidate_url: "https://x.com/a/status/2",
          },
        },
      ],
    });

    expect(html.indexOf("Original")).toBeLessThan(html.indexOf("Reply"));
  });

  test("renders index-linked thread replies after the original post", () => {
    const html = renderDocument({
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:reply",
          source: "x",
          index: 2,
          url: "https://x.com/a/status/2",
          author: { handle: "@a" },
          content: { text: "Reply" },
          stats: {},
          media: [],
          cards: [],
          thread: {},
        },
        {
          id: "x:root",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/1",
          author: { handle: "@a" },
          content: { text: "Original" },
          stats: {},
          media: [],
          cards: [],
          thread: {
            child_candidate_index: 2,
          },
        },
      ],
    });

    expect(html.indexOf("Original")).toBeLessThan(html.indexOf("Reply"));
  });

  test("injects viewport autoplay script for rendered videos", () => {
    const html = renderDocument({
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          index: 1,
          url: "https://x.com/a/status/1",
          author: { handle: "@a" },
          content: { text: "Video" },
          stats: {},
          media: [
            {
              media_kind: "video",
              href: "https://x.com/a/status/1",
              local_src: "feed-assets/poster.jpg",
              local_video_src: "feed-assets/video.mp4",
            },
          ],
          cards: [],
          thread: {},
        },
      ],
    });

    expect(html).toContain("IntersectionObserver");
    expect(html).toContain('document.querySelectorAll("video.media-video")');
    expect(html).toContain("video.play()");
  });
});
