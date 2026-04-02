import { describe, expect, test } from "vitest";
import { prepareFeed } from "../sources/x/capture.js";

function createBrowserStub(existingFeedState) {
  const calls = [];
  return {
    calls,
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
      url: "https://x.com/i/flow/login",
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
