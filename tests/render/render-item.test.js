import { describe, expect, test } from "vitest";
import { renderItemCard } from "../../lib/render/item.ts";

describe("renderItemCard", () => {
  test("renders generic feed card markup from normalized stats", () => {
    const html = renderItemCard({
      id: "linkedin:1",
      source: "linkedin",
      index: 1,
      url: "https://www.linkedin.com/feed/update/1/",
      author: { handle: "janedoe", display_name: "Jane Doe" },
      content: { text: "Shipping a new adapter." },
      stats: { reply: "12", share: "5", like: "44", view: "900" },
      media: [],
      cards: [],
      thread: {},
    });

    expect(html).toContain('class="feed-card source-linkedin"');
    expect(html).toContain("LinkedIn");
    expect(html).toContain("Shipping a new adapter.");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("@janedoe");
    expect(html).toContain("12");
    expect(html).toContain("900");
    expect(html).toContain("Open");
  });

  test("renders a playable local video when media has a downloaded file", () => {
    const html = renderItemCard({
      id: "x:1",
      source: "x",
      index: 1,
      url: "https://x.com/a/status/1",
      author: { handle: "@a" },
      content: { text: "Video post" },
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
    });

    expect(html).toContain("<video");
    expect(html).toContain('src="feed-assets/video.mp4"');
    expect(html).toContain('poster="feed-assets/poster.jpg"');
    expect(html).toContain("Open on X");
  });

  test("uses the correct platform label for non-x local videos", () => {
    const html = renderItemCard({
      id: "tiktok:1",
      source: "tiktok",
      index: 1,
      url: "https://www.tiktok.com/@demo/video/1",
      author: { handle: "@demo" },
      content: { text: "TikTok video" },
      stats: {},
      media: [
        {
          media_kind: "video",
          href: "https://www.tiktok.com/@demo/video/1",
          local_src: "feed-assets/poster.jpg",
          local_video_src: "feed-assets/video.mp4",
        },
      ],
      cards: [],
      thread: {},
    });

    expect(html).toContain("Open on TikTok");
  });

  test("renders youtube watch items as local video players when available", () => {
    const html = renderItemCard({
      id: "youtube:1",
      source: "youtube",
      index: 1,
      url: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
      author: { handle: "LastWeekTonight" },
      content: { text: "Prediction Markets" },
      stats: {},
      media: [
        {
          media_kind: "video",
          href: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
          src: "https://i.ytimg.com/vi/ZN4njIQcSR4/hq720.jpg",
          local_src: "feed-assets/poster.jpg",
          local_video_src: "feed-assets/video.mp4",
          alt: "Prediction Markets",
          source: "youtube",
        },
      ],
      cards: [],
      thread: {},
    });

    expect(html).toContain("<video");
    expect(html).toContain('src="feed-assets/video.mp4"');
    expect(html).toContain("Open on YouTube");
    expect(html).toContain('class="media-player"');
  });

  test("renders youtube items without local video as linked thumbnails", () => {
    const html = renderItemCard({
      id: "youtube:short1",
      source: "youtube",
      index: 1,
      url: "https://www.youtube.com/shorts/aIvHf8vsWBM",
      author: { handle: "Shorts" },
      content: { text: "Why Vibe Coding Fails - Ilya Sutskever" },
      stats: {},
      media: [
        {
          media_kind: "video",
          href: "https://www.youtube.com/shorts/aIvHf8vsWBM",
          src: "https://i.ytimg.com/vi/aIvHf8vsWBM/oardefault.jpg",
          alt: "Why Vibe Coding Fails - Ilya Sutskever",
          source: "youtube",
        },
      ],
      cards: [],
      thread: {},
    });

    expect(html).toContain("<iframe");
    expect(html).toContain("youtube-nocookie.com/embed/aIvHf8vsWBM");
    expect(html).toContain("Open on YouTube");
  });

  test("falls back to remote video sources so autoplay-capable players still render", () => {
    const html = renderItemCard({
      id: "x:2",
      source: "x",
      index: 2,
      url: "https://x.com/a/status/2",
      author: { handle: "@a" },
      content: { text: "Remote video" },
      stats: {},
      media: [
        {
          media_kind: "video",
          href: "https://x.com/a/status/2",
          src: "https://example.com/poster.jpg",
          video_src: "https://example.com/video.mp4",
        },
      ],
      cards: [],
      thread: {},
    });

    expect(html).toContain("<video");
    expect(html).toContain('src="https://example.com/video.mp4"');
  });

  test("omits broken empty image tags when media has no usable source", () => {
    const html = renderItemCard({
      id: "linkedin:2",
      source: "linkedin",
      index: 2,
      url: "https://www.linkedin.com/feed/update/2/",
      author: { handle: "demo" },
      content: { text: "Missing media" },
      stats: {},
      media: [
        {
          media_kind: "image",
          href: "https://www.linkedin.com/feed/update/2/",
        },
      ],
      cards: [],
      thread: {},
    });

    expect(html).not.toContain('<img src=""');
    expect(html).toContain('class="media-fallback"');
  });

  test("does not emit an empty stats link when item url is missing", () => {
    const html = renderItemCard({
      id: "instagram:synthetic:1",
      source: "instagram",
      index: 1,
      url: null,
      author: { handle: "@demo" },
      content: { text: "Caption" },
      stats: {},
      media: [],
      cards: [],
      thread: {},
    });

    expect(html).not.toContain('class="action-link"');
    expect(html).not.toContain('href=""');
  });
});
