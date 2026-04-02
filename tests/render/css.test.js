import { describe, expect, test } from "vitest";
import { getRenderCss } from "../../lib/render/css.js";

describe("render css", () => {
  test("contains the core feed and filter styles", () => {
    const css = getRenderCss();

    expect(css).toContain("--bg: #eef3f4;");
    expect(css).toContain(".feed-card");
    expect(css).toContain(".platform-filter-group");
    expect(css).toContain("@media (max-width: 720px)");
  });
});
