import { describe, expect, test } from "vitest";
import { prepareFeed } from "../sources/instagram/capture.js";
import {
  extractInstagramSourceItemId,
  isInstagramPermalinkUrl,
  isInstagramProfileUrl,
} from "../sources/instagram/parse.js";

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

describe("instagram parse helpers", () => {
  test("extracts canonical source ids from post and reel urls", () => {
    expect(
      extractInstagramSourceItemId("https://www.instagram.com/p/DW6Oe10jEFH/"),
    ).toBe("p:DW6Oe10jEFH");
    expect(
      extractInstagramSourceItemId(
        "https://www.instagram.com/reel/DXL2FRrO2RU/",
      ),
    ).toBe("reel:DXL2FRrO2RU");
  });

  test("recognizes permalink and profile urls", () => {
    expect(isInstagramPermalinkUrl("/p/DW6Oe10jEFH/")).toBe(true);
    expect(isInstagramPermalinkUrl("/fredheir/")).toBe(false);
    expect(isInstagramProfileUrl("/fredheir/")).toBe(true);
    expect(isInstagramProfileUrl("/explore/")).toBe(false);
  });
});

describe("instagram capture bootstrap", () => {
  test("opens the signed-in instagram feed and waits for feed articles", () => {
    const browser = createBrowserStub({
      url: "https://www.instagram.com/",
      text: "For you",
    });

    prepareFeed(browser);

    expect(browser.calls.some(([name]) => name === "ensureTab")).toBe(true);
    expect(browser.calls.some(([name]) => name === "evalText")).toBe(true);
    expect(
      browser.calls.filter(([name]) => name === "tryWaitForFunction").length,
    ).toBeGreaterThan(0);
  });
});
