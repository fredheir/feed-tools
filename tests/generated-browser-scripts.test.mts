import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildExtractionScript: buildBlueskyScript,
} = require("../sources/bluesky/capture.js");
const {
  buildExtractionScript: buildInstagramScript,
} = require("../sources/instagram/capture.js");
const {
  buildExtractionScript: buildLinkedInScript,
} = require("../sources/linkedin/capture.js");
const {
  buildExtractionScript: buildTikTokScript,
} = require("../sources/tiktok/capture.js");
const {
  buildExtractionScript: buildXScript,
} = require("../sources/x/capture.js");
const {
  buildExtractionScript: buildYouTubeScript,
} = require("../sources/youtube/capture.js");

const scripts = {
  bluesky: buildBlueskyScript,
  instagram: buildInstagramScript,
  linkedin: buildLinkedInScript,
  tiktok: buildTikTokScript,
  x: buildXScript,
  youtube: buildYouTubeScript,
};

describe("generated browser extraction scripts", () => {
  test.each(Object.entries(scripts))(
    "%s script is a self-invoking browser expression",
    (_source, buildScript) => {
      const script = buildScript(2);

      expect(script).toContain("(() => {");
      expect(script).toContain("const limit = 2;");
      expect(script).toContain("return JSON.stringify");
      expect(script).not.toContain("[native code]");
      expect(script).not.toContain("undefined(");
      expect(script).not.toContain("__name(");
    },
  );

  test("tiktok script reads universal data and visible feed articles", () => {
    const script = buildTikTokScript(2);

    expect(script).toContain("webapp.updated-items");
    expect(script).toContain("buildTikTokItemsFromUniversalData");
    expect(script).toContain("buildTikTokItemsFromDom");
    expect(script).toContain(
      'article[data-e2e="recommend-list-item-container"]',
    );
  });
});
