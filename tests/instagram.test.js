import { describe, expect, test } from "vitest";
import { prepareFeed } from "../sources/instagram/capture.js";
import { normalizeInstagramCandidate } from "../sources/instagram/capture.js";
import {
  extractInstagramSourceItemId,
  isInstagramItemWorthKeeping,
  isInstagramPermalinkUrl,
  isInstagramProfileUrl,
} from "../sources/instagram/parse.js";
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
    expect(isInstagramPermalinkUrl("/fixture_user/")).toBe(false);
    expect(isInstagramProfileUrl("/fixture_user/")).toBe(true);
    expect(isInstagramProfileUrl("/explore/")).toBe(false);
  });

  test("rejects instagram items that do not have a usable permalink", () => {
    expect(
      isInstagramItemWorthKeeping({
        source_item_id: null,
        url: null,
        author: { handle: "@brand" },
        content: { text: "Buy now" },
        media: [{ src: "https://example.com/image.jpg" }],
      }),
    ).toBe(false);
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

describe("instagram capture integration", () => {
  test("derives source_item_id from permalink before filtering", () => {
    const item = normalizeInstagramCandidate({
      source: "instagram",
      source_item_id: null,
      url: "https://www.instagram.com/p/DW6Oe10jEFH/",
      author: { handle: "@example" },
      content: { text: "caption" },
      media: [],
    });

    expect(item.source_item_id).toBe("p:DW6Oe10jEFH");
  });

  test("real-browser feed fixture still exposes extractor signals", () => {
    const html = readFixture("instagram", "article.html");

    expect(html).toContain("/fixture_user/");
    expect(html.includes('href="/p/') || html.includes('href="/reel/')).toBe(
      true,
    );
    expect(html).toContain("More Options");
    expect(html).toContain("Like");
    expect(html).toContain("Comment");
    expect(html).toContain("Share");
    expect(html).toContain("Save");
    expect(html).toContain("<img");
  });
});
