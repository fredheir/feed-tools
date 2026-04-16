import { describe, expect, test } from "vitest";
import { prepareFeed } from "../sources/tiktok/capture.js";

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
