import { describe, expect, test } from "vitest";
import {
  getPlatformIconDataUri,
  getPlatformIconMeta,
} from "../../lib/render/platform-icons.ts";

describe("platform icons", () => {
  test("normalizes aliases and returns data uris for icons", () => {
    expect(getPlatformIconMeta("facebook")).toEqual({
      key: "fb",
      label: "Facebook",
    });
    expect(getPlatformIconMeta("unknown")).toEqual({
      key: "x",
      label: "unknown",
    });
    expect(getPlatformIconDataUri("linkedin")).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/,
    );
  });
});
