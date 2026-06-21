import { describe, expect, test } from "vitest";
import {
  isSupportedSource,
  listSupportedSources,
  SUPPORTED_SOURCES,
} from "../lib/source-catalog.ts";
import { listManifestSourceNames } from "../sources/manifest.ts";

describe("source catalog", () => {
  test("exposes the canonical supported source list", () => {
    expect(SUPPORTED_SOURCES).toEqual(listManifestSourceNames());
    expect(listSupportedSources()).toEqual([
      "bluesky",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "youtube",
      "x",
    ]);
  });

  test("answers support checks without loading runtime handlers", () => {
    expect(isSupportedSource("x")).toBe(true);
    expect(isSupportedSource("mastodon")).toBe(false);
  });
});
