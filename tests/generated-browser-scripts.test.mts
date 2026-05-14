import { describe, expect, test } from "vitest";

import { buildExtractionScript as buildBlueskyScript } from "../sources/bluesky/capture.ts";
import { buildExtractionScript as buildFacebookScript } from "../sources/facebook/capture.ts";
import { buildExtractionScript as buildInstagramScript } from "../sources/instagram/capture.ts";
import { buildExtractionScript as buildLinkedInScript } from "../sources/linkedin/capture.ts";
import { buildExtractionScript as buildTikTokScript } from "../sources/tiktok/capture.ts";
import { buildExtractionScript as buildXScript } from "../sources/x/capture.ts";
import { buildExtractionScript as buildYouTubeScript } from "../sources/youtube/capture.ts";

const scripts = {
  bluesky: buildBlueskyScript,
  facebook: buildFacebookScript,
  instagram: buildInstagramScript,
  linkedin: buildLinkedInScript,
  tiktok: buildTikTokScript,
  x: buildXScript,
  youtube: buildYouTubeScript,
};

describe("generated browser extraction scripts", () => {
  test.each(
    Object.entries(scripts),
  )("%s script is a self-invoking browser expression", (_source, buildScript) => {
    const script = buildScript(2);

    expect(script).toContain("(() => {");
    expect(script).toContain("const limit = 2;");
    expect(script).toContain("return JSON.stringify");
    expect(script).not.toContain("[native code]");
    expect(script).not.toContain("undefined(");
    expect(script).not.toContain("__name(");
  });

  test("tiktok script reads universal data and visible feed articles", () => {
    const script = buildTikTokScript(2);

    expect(script).toContain("webapp.updated-items");
    expect(script).toContain("buildTikTokItemsFromUniversalData");
    expect(script).toContain("buildTikTokItemsFromDom");
    expect(script).not.toContain("Array.from                (");
    expect(script).toContain(
      'article[data-e2e="recommend-list-item-container"]',
    );
  });

  test("youtube script preserves regex escapes used by text fallbacks", () => {
    const script = buildYouTubeScript(2);

    expect(script).toContain(String.raw`/(\d[\d.,KMBmkmb]*\s+views?)/i`);
    expect(script).toContain(String.raw`/\bSponsored\b/i`);
    expect(script).not.toContain("/(d[d.,KMBmkmb]*s+views?)/i");
  });

  test("facebook script does not treat group home links as post permalinks", () => {
    const script = buildFacebookScript(2);

    expect(script).toContain(
      String.raw`\/groups\/[^/]+\/(?:posts|permalink)\/[^/?#]+$`,
    );
    expect(script).toContain("host !== 'facebook.com'");
    expect(script).not.toContain("photo|groups");
    expect(script).not.toContain("videos|watch|permalink");
    expect(script).toContain("path === '/watch'");
    expect(script).toContain("parsed.searchParams.get('v')");
    expect(script).toContain("path === '/photo'");
    expect(script).toContain("path === '/permalink.php'");
  });

  test("facebook script keeps roots that only expose the plain author-link fallback", () => {
    const script = buildFacebookScript(2);

    expect(script).toContain("function pickPlainAuthorLink(root)");
    expect(script).toContain("return pickPlainAuthorLink(root);");
    expect(script).toContain(
      "if (!root.querySelector('h2, h3, h4, strong a[href]') && !pickPlainAuthorLink(root)) return true;",
    );
    expect(script).not.toContain(
      "if (!root.querySelector('h2, h3, h4, strong a[href]')) return true;",
    );
  });

  test("x script can recover avatars from React fiber props", () => {
    const script = buildXScript(2);

    expect(script).toContain("__reactFiber$");
    expect(script).toContain("__reactProps$");
    expect(script).toContain("pbs.twimg.com/profile_images/");
    expect(script).toContain("memoizedProps");
  });
});
