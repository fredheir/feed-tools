import { describe, expect, test } from "vitest";
import { prepareFeed } from "../sources/x/capture.js";
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
