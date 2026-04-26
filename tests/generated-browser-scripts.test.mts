import { describe, expect, test } from "vitest";

import { buildExtractionScript as buildBlueskyScript } from "../sources/bluesky/capture.ts";
import { buildExtractionScript as buildInstagramScript } from "../sources/instagram/capture.ts";
import { buildExtractionScript as buildLinkedInScript } from "../sources/linkedin/capture.ts";
import { buildExtractionScript as buildTikTokScript } from "../sources/tiktok/capture.ts";
import { buildExtractionScript as buildXScript } from "../sources/x/capture.ts";
import { buildExtractionScript as buildYouTubeScript } from "../sources/youtube/capture.ts";

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
