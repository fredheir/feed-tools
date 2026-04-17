import { describe, expect, test } from "vitest";
import {
  buildTikTokItemsFromUniversalData,
  prepareFeed,
} from "../sources/tiktok/capture.js";
import { readFixture } from "./helpers/cli-config.js";

function createBrowserStub(existingState) {
  const calls = [];
  return {
    calls,
    ensureTab(...args) {
      calls.push(["ensureTab", ...args]);
    },
    tryWaitForFunction(expression) {
      calls.push(["tryWaitForFunction", expression]);
      return true;
    },
    getCurrentUrl() {
      calls.push(["getCurrentUrl"]);
      return existingState.url;
    },
    snapshotText() {
      calls.push(["snapshotText"]);
      return existingState.text;
    },
    evalText(expression) {
      calls.push(["evalText", expression]);
      return JSON.stringify({ ok: true });
    },
  };
}

describe("tiktok capture bootstrap", () => {
  test("opens the public TikTok feed and waits for public video content", () => {
    const browser = createBrowserStub({
      url: "https://www.tiktok.com/",
      text: "For You",
    });

    prepareFeed(browser);

    expect(browser.calls.some(([name]) => name === "ensureTab")).toBe(true);
    expect(browser.calls.some(([name]) => name === "evalText")).toBe(true);
    expect(
      browser.calls.filter(([name]) => name === "tryWaitForFunction").length,
    ).toBeGreaterThan(0);
  });
});

describe("tiktok fixture contract", () => {
  test("maps real-browser universal items into the normalized feed shape", () => {
    const universalItems = JSON.parse(
      readFixture("tiktok", "universal-items.json"),
    );
    const items = buildTikTokItemsFromUniversalData(universalItems, 2);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: "tiktok",
      source_item_id: "7619758421079936278",
      url: "https://www.tiktok.com/@fixture_user_one/video/7619758421079936278",
      author: {
        handle: "@fixture_user_one",
        display_name: "Fixture User One",
      },
      stats: {
        reply: "745",
        share: "7302",
        like: "81500",
        view: "1500000",
      },
    });
    expect(items[0].media[0]).toMatchObject({
      media_kind: "video",
      src: "https://example.invalid/video-one-origin.jpg",
      video_src: "https://example.invalid/video-one-download.mp4",
    });
    expect(items[1].embedded_links).toEqual([
      {
        href: "https://www.tiktok.com/tag/RedCarpetBoy",
        text: "#RedCarpetBoy",
        kind: "entity",
      },
      {
        href: "https://www.tiktok.com/tag/WGS2026",
        text: "#WGS2026",
        kind: "entity",
      },
      {
        href: "https://www.tiktok.com/tag/WorldGovSummit",
        text: "#WorldGovSummit",
        kind: "entity",
      },
      {
        href: "https://www.tiktok.com/music/original-sound-7607527104662899478",
        text: "original sound",
        kind: "entity",
      },
    ]);
  });
});
