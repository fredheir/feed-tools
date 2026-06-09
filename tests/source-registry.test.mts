import { describe, expect, test } from "vitest";

import {
  SUPPORTED_SOURCES,
  isSupportedSource,
  listSupportedSources,
} from "../lib/source-catalog.ts";
import { getBootstrapHandler, getCaptureHandler } from "../sources/registry.ts";

describe("source registry", () => {
  test("lists the supported capture sources from the canonical registry", () => {
    expect(listSupportedSources()).toEqual([...SUPPORTED_SOURCES]);
  });

  test("resolves handlers for every supported source", () => {
    for (const source of listSupportedSources()) {
      expect(isSupportedSource(source)).toBe(true);
      expect(typeof getCaptureHandler(source)).toBe("function");
      expect(typeof getBootstrapHandler(source)).toBe("function");
    }
  });
});
