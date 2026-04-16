import { describe, expect, test } from "vitest";
import {
  isSupportedSource,
  listSupportedSources,
  SUPPORTED_SOURCES,
} from "../lib/source-catalog.js";

describe("source catalog", () => {
  test("exposes the canonical supported source list", () => {
    expect(SUPPORTED_SOURCES).toEqual([
      "bluesky",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "x",
    ]);
    expect(listSupportedSources()).toEqual(SUPPORTED_SOURCES);
  });

  test("answers support checks without loading runtime handlers", () => {
    expect(isSupportedSource("x")).toBe(true);
    expect(isSupportedSource("mastodon")).toBe(false);
  });
});
