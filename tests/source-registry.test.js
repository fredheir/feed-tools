import { describe, expect, test } from "vitest";
import {
  getBootstrapHandler,
  getCaptureHandler,
  isSupportedSource,
  listSupportedSources,
} from "../lib/source-registry.js";

describe("source registry", () => {
  test("lists the supported capture sources from the canonical registry", () => {
    expect(listSupportedSources()).toEqual([
      "bluesky",
      "facebook",
      "instagram",
      "linkedin",
      "tiktok",
      "x",
    ]);
  });

  test("resolves handlers for every supported source", () => {
    for (const source of listSupportedSources()) {
      expect(isSupportedSource(source)).toBe(true);
      expect(typeof getCaptureHandler(source)).toBe("function");
      expect(typeof getBootstrapHandler(source)).toBe("function");
    }
  });
});
