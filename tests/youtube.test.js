import { describe, expect, test } from "vitest";

import { renderItemCard } from "../lib/render/item.js";
import { getCaptureHandler } from "../lib/source-registry.js";
import { isSupportedSource } from "../lib/source-catalog.js";
import {
  assertYouTubeCaptureReady,
  extractYouTubeVideoId,
  normalizeYouTubeCardsToItems,
  normalizeYouTubeExtractionDocument,
  prepareFeed,
} from "../sources/youtube/capture.js";

function createBrowserStub(existingState) {
  const calls = [];
  let activeUrl = existingState.url;
  let activeText = existingState.text;
  return {
    calls,
    ensureTab(...args) {
      calls.push(["ensureTab", ...args]);
    },
    listTabs() {
      calls.push(["listTabs"]);
      return existingState.tabs || [];
    },
    switchToTab(index) {
      calls.push(["switchToTab", index]);
      const next = (existingState.tabStates || {})[index];
      if (next) {
        activeUrl = next.url;
        activeText = next.text;
      }
    },
    tryWaitForFunction(expression) {
      calls.push(["tryWaitForFunction", expression]);
      return true;
    },
    getCurrentUrl() {
      calls.push(["getCurrentUrl"]);
      return activeUrl;
    },
    snapshotText() {
      calls.push(["snapshotText"]);
      return activeText;
    },
    evalText(expression) {
      calls.push(["evalText", expression]);
      return JSON.stringify({ ok: true });
    },
  };
}

describe("youtube support", () => {
  test("extracts stable source ids from youtube watch and shorts urls", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=ZN4njIQcSR4&t=42"),
    ).toBe("ZN4njIQcSR4");
    expect(
      extractYouTubeVideoId("https://www.youtube.com/shorts/aIvHf8vsWBM"),
    ).toBe("aIvHf8vsWBM");
  });

  test("registers youtube as a supported source", () => {
    expect(isSupportedSource("youtube")).toBe(true);
    expect(typeof getCaptureHandler("youtube")).toBe("function");
  });

  test("opens the signed-in youtube home feed and waits for video content", () => {
    const browser = createBrowserStub({
      url: "https://www.youtube.com/",
      text: "All Shorts 2.3m views 2 days ago",
    });

    prepareFeed(browser);

    expect(browser.calls.some(([name]) => name === "ensureTab")).toBe(true);
    expect(browser.calls.some(([name]) => name === "evalText")).toBe(true);
    expect(
      browser.calls.filter(([name]) => name === "tryWaitForFunction").length,
    ).toBeGreaterThan(0);
  });

  test("switches away from a blocked youtube tab before continuing", () => {
    const browser = createBrowserStub({
      url: "https://www.youtube.com/",
      text: "Make YouTube your own Turn on history",
      tabs: [
        { index: 1, url: "https://www.youtube.com/" },
        { index: 2, url: "https://www.youtube.com/" },
      ],
      tabStates: {
        2: {
          url: "https://www.youtube.com/",
          text: "All Shorts 2.3m views 2 days ago",
        },
      },
    });

    prepareFeed(browser);

    expect(browser.calls.some(([name]) => name === "listTabs")).toBe(true);
    expect(browser.calls).toContainEqual(["switchToTab", 2]);
  });

  test("maps homepage cards into normalized youtube feed items", () => {
    const items = normalizeYouTubeCardsToItems(
      [
        {
          kind: "video",
          url: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
          title: "Prediction Markets: Last Week Tonight with John Oliver (HBO)",
          authorName: "LastWeekTonight",
          authorUrl: "https://www.youtube.com/@LastWeekTonight",
          viewText: "2.3m views",
          publishedText: "2 days ago",
          durationText: "32:59",
          thumbnailUrl: "https://i.ytimg.com/vi/ZN4njIQcSR4/hq720.jpg",
          profileImageUrl: "https://yt3.googleusercontent.com/channel-avatar",
        },
        {
          kind: "short",
          url: "https://www.youtube.com/shorts/aIvHf8vsWBM",
          title: "Why Vibe Coding Fails - Ilya Sutskever",
          authorName: null,
          authorUrl: null,
          viewText: "1.7m views",
          thumbnailUrl: "https://i.ytimg.com/vi/aIvHf8vsWBM/oar2.jpg",
        },
      ],
      2,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: "youtube",
      source_item_id: "ZN4njIQcSR4",
      url: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
      author: {
        handle: "LastWeekTonight",
        display_name: "LastWeekTonight",
      },
      stats: {
        view: "2.3m views",
      },
    });
    expect(items[0].media[0]).toMatchObject({
      media_kind: "video",
      src: "https://i.ytimg.com/vi/ZN4njIQcSR4/hq720.jpg",
      duration: 1979,
    });
    expect(items[1]).toMatchObject({
      source: "youtube",
      source_item_id: "aIvHf8vsWBM",
      url: "https://www.youtube.com/shorts/aIvHf8vsWBM",
      content: {
        text: "Why Vibe Coding Fails - Ilya Sutskever",
      },
    });
  });

  test("parses word-based aria-label durations when badge text is missing", () => {
    const items = normalizeYouTubeCardsToItems(
      [
        {
          kind: "video",
          url: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
          title: "Longform talk",
          authorName: "TED",
          durationText: "1 hour, 2 minutes",
          thumbnailUrl: "https://i.ytimg.com/vi/ZN4njIQcSR4/hq720.jpg",
        },
      ],
      1,
    );

    expect(items[0].media[0]).toMatchObject({
      duration: 3720,
    });
  });

  test("normalizes browser extraction output before merge/dedupe", () => {
    const document = normalizeYouTubeExtractionDocument({
      captured_at: "2026-04-22T10:00:00Z",
      cards: [
        {
          url: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
          title: "Prediction Markets",
          authorName: "LastWeekTonight",
          viewText: "2.3m views",
          thumbnailUrl: "https://i.ytimg.com/vi/ZN4njIQcSR4/hq720.jpg",
        },
      ],
    });

    expect(document).toMatchObject({
      source: "youtube",
      captured_at: "2026-04-22T10:00:00Z",
      items: [
        {
          id: "youtube:ZN4njIQcSR4",
          source: "youtube",
          source_item_id: "ZN4njIQcSR4",
          index: 1,
          content: { text: "Prediction Markets" },
          stats: { view: "2.3m views" },
        },
      ],
    });
  });

  test("renders youtube cards with the platform metadata", () => {
    const html = renderItemCard({
      id: "youtube:ZN4njIQcSR4",
      source: "youtube",
      index: 1,
      url: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
      author: {
        handle: "LastWeekTonight",
        display_name: "LastWeekTonight",
      },
      content: {
        text: "Prediction Markets: Last Week Tonight with John Oliver (HBO)",
      },
      stats: { reply: null, share: null, like: null, view: "2.3m views" },
      media: [
        {
          src: "https://i.ytimg.com/vi/ZN4njIQcSR4/hq720.jpg",
          href: "https://www.youtube.com/watch?v=ZN4njIQcSR4",
          media_kind: "video",
        },
      ],
      cards: [],
      thread: {},
      embedded_links: [],
    });

    expect(html).toContain('class="feed-card source-youtube"');
    expect(html).toContain("YouTube");
    expect(html).toContain("Prediction Markets");
  });

  test("fails closed when youtube extraction produces no items", () => {
    const browser = createBrowserStub({
      url: "https://www.youtube.com/",
      text: "All Shorts 2.3m views 2 days ago",
    });

    expect(() =>
      assertYouTubeCaptureReady(browser, {
        schema_version: 1,
        source: "youtube",
        captured_at: "2026-04-22T10:00:00Z",
        items: [],
      }),
    ).toThrow(/no homepage items were extracted/);
  });
});
