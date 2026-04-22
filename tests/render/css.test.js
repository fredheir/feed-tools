import { describe, expect, test } from "vitest";
import { getRenderCss } from "../../lib/render/css.js";

describe("render css", () => {
  test("contains the core feed and filter styles", () => {
    const css = getRenderCss();

    expect(css).toContain("--bg: #edf2f7;");
    expect(css).toContain(".feed-card");
    expect(css).toContain(".platform-filter-group");
    expect(css).toContain(".app-topbar");
    expect(css).toContain(".actions");
    expect(css).toContain(".dev-banner");
    expect(css).toContain(".refresh-rail");
    expect(css).toContain("@media (max-width: 720px)");
  });
});
