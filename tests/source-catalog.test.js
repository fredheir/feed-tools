import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { isSupportedSource, SUPPORTED_SOURCES } from "../lib/source-catalog.ts";
import { SOURCE_NAMES } from "../lib/source-metadata.ts";

describe("source catalog", () => {
  test("exposes the canonical supported source list", () => {
    expect(SUPPORTED_SOURCES).toEqual([...SOURCE_NAMES]);
    expect([...SUPPORTED_SOURCES]).toEqual([
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
    expect(readFileSync("lib/source-catalog.ts", "utf8")).not.toContain(
      "../sources/manifest",
    );
  });
});
