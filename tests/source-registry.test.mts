import { describe, expect, test } from "vitest";

import {
  SUPPORTED_SOURCES,
  isSupportedSource,
  listSupportedSources,
} from "../lib/source-catalog.ts";
import {
  SOURCE_ACCESS_POLICIES,
  SOURCE_SIGNIN_TARGETS,
} from "../lib/source-metadata.ts";
import { getSourceConfig } from "../lib/cic/source-config.ts";
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

  test("uses one source access policy for sign-in and CiC prep metadata", () => {
    for (const source of listSupportedSources()) {
      const config = getSourceConfig(source);

      expect(config?.url).toBe(SOURCE_SIGNIN_TARGETS[source].url);
      expect(config?.urlPrefixes).toEqual(
        SOURCE_ACCESS_POLICIES[source].urlPrefixes,
      );
      expect(config?.blockedUrlPatterns).toEqual(
        SOURCE_ACCESS_POLICIES[source].blockedUrlPatterns,
      );
      expect(config?.blockedTextPatterns).toEqual(
        SOURCE_ACCESS_POLICIES[source].blockedTextPatterns,
      );
    }
  });
});
