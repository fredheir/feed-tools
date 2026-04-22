import { describe, expect, test } from "vitest";
import {
  normalizeXExtractionDocument,
  prepareFeed,
} from "../sources/x/capture.js";
import { readFixture } from "./helpers/cli-config.js";

function createBrowserStub(existingFeedState) {
  const calls = [];
  return {
    calls,
    getCurrentUrl() {
      calls.push(["getCurrentUrl"]);
      return existingFeedState.url;
    },
    snapshotText() {
      calls.push(["snapshotText"]);
      return existingFeedState.text;
    },
    ensureTab(...args) {
      calls.push(["ensureTab", ...args]);
    },
    evalJson() {
      calls.push(["evalJson"]);
      return existingFeedState;
    },
    reloadCurrentTab() {
      calls.push(["reloadCurrentTab"]);
    },
    tryWaitForFunction(expression) {
      calls.push(["tryWaitForFunction", expression]);
      return true;
    },
    evalText(expression) {
      calls.push(["evalText", expression]);
      return JSON.stringify({ ok: true });
    },
  };
}

describe("x capture bootstrap", () => {
  test("reuses an already hydrated x feed without reloading", () => {
    const browser = createBrowserStub({
      url: "https://x.com/home",
      articleCount: 5,
      feedItems: 5,
      text: "For you",
    });

    prepareFeed(browser);

    expect(browser.calls.some(([name]) => name === "reloadCurrentTab")).toBe(
      false,
    );
  });

  test("reloads and waits when the current page is not yet a usable feed", () => {
    const browser = createBrowserStub({
      url: "https://x.com/home",
      articleCount: 0,
      feedItems: 0,
      text: "",
    });

    prepareFeed(browser);

    expect(browser.calls.some(([name]) => name === "ensureTab")).toBe(true);
    expect(browser.calls.some(([name]) => name === "evalText")).toBe(true);
    expect(
      browser.calls.filter(([name]) => name === "tryWaitForFunction").length,
    ).toBeGreaterThan(0);
  });
});

describe("x fixture contract", () => {
  test("real-browser signed-in article fixture still exposes extractor selectors", () => {
    const html = readFixture("x", "article.html");

    expect(html).toContain('data-testid="socialContext"');
    expect(html).toContain('data-testid="Tweet-User-Avatar"');
    expect(html).toContain('data-testid="tweetText"');
    expect(html).toContain('data-testid="tweetPhoto"');
    expect(html).toContain('data-testid="reply"');
    expect(html).toContain('data-testid="retweet"');
    expect(html).toContain('data-testid="like"');
    expect(html).toContain("profile_images/FIXTURE_normal.jpg");
    expect(html).toContain("/fixture_user/status/123456789");
    expect(html).toContain("View post analytics");
    expect(html).toContain("fixture_reposter");
    expect(html).toContain("@fixture_author");
  });
});

describe("x extraction normalization", () => {
  test("normalizes browser extraction output before it enters shared internals", () => {
    const document = normalizeXExtractionDocument({
      captured_at: "2026-04-22T10:00:00Z",
      items: [
        {
          source_item_id: "123456789",
          url: "https://x.com/example/status/123456789",
          content: { text: "Hello from X" },
          author: { handle: "@example", profile_image_url: "https://img" },
          stats: { like: "5" },
          capture_incomplete: true,
        },
      ],
      meta: {
        article_count: 3,
        hydrated_count: 1,
        incomplete_count: 2,
      },
    });

    expect(document).toMatchObject({
      source: "x",
      captured_at: "2026-04-22T10:00:00Z",
      items: [
        {
          id: "x:123456789",
          source: "x",
          source_item_id: "123456789",
          index: 1,
          content: { text: "Hello from X" },
          stats: { like: "5" },
        },
      ],
      meta: {
        article_count: 3,
        hydrated_count: 1,
        incomplete_count: 2,
      },
    });
    expect(document.items[0]).not.toHaveProperty("capture_incomplete");
  });

  test("rejects malformed browser extraction payloads", () => {
    expect(() => normalizeXExtractionDocument({ items: "bad" })).toThrow(
      /Invalid x extraction payload/,
    );
  });

  test("rejects malformed extraction meta", () => {
    expect(() =>
      normalizeXExtractionDocument({
        items: [],
        meta: {
          article_count: "bad",
          hydrated_count: 1,
          incomplete_count: 0,
        },
      }),
    ).toThrow(/Invalid x extraction meta/);
  });
});
