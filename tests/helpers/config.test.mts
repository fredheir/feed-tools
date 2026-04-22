import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_SAVE_DIR,
  getCaptureBrowserOptions,
  getCaptureDefaults,
  getCurationPreferences,
  getDefaultSource,
  getEnabledSourceNames,
  getSaveDir,
  resolveCanonicalSaveDir,
} from "../../lib/config.js";
import type { FeedConfig } from "../../lib/types.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("config helpers", () => {
  test("reads enabled sources and capture defaults from config-like objects", () => {
    const config: FeedConfig = {
      user_preferences: {
        sources: [
          {
            name: "x",
            enabled: true,
            default: true,
            capture: {
              save_dir: "./var/x-archive",
              default_limit: 20,
              browser: {
                session: "feed-x",
              },
            },
          },
          {
            name: "linkedin",
            enabled: false,
            capture: {
              save_dir: "./var/linkedin-archive",
            },
          },
        ],
        curation: {
          fallback_category: "Other",
          preferred_categories: ["Coding"],
        },
      },
    };

    expect(getEnabledSourceNames(config)).toEqual(["x"]);
    expect(getDefaultSource(config)).toBe("x");
    expect(getCaptureDefaults(config, "x")).toEqual({
      save_dir: "./var/x-archive",
      default_limit: 20,
      browser: { session: "feed-x" },
    });
    expect(getCaptureBrowserOptions(config, "x")).toEqual({
      session: "feed-x",
    });
    expect(getSaveDir(config, "x")).toBe(path.join(repoRoot, "var/x-archive"));
    expect(getSaveDir(config)).toBe(path.join(repoRoot, "var/x-archive"));
    expect(getCurationPreferences(config)).toEqual({
      fallback_category: "Other",
      preferred_categories: ["Coding"],
    });
  });

  test("normalizes explicit and legacy save-dir requests", () => {
    const config: FeedConfig = {
      user_preferences: {
        sources: [
          {
            name: "x",
            capture: {
              save_dir: "./var/source-specific",
            },
          },
        ],
      },
    };

    expect(resolveCanonicalSaveDir(config, "./tmp/custom", "x")).toBe(
      path.join(repoRoot, "tmp/custom"),
    );
    expect(resolveCanonicalSaveDir(config, "var", "x")).toBe(
      path.join(repoRoot, "var/source-specific"),
    );
    expect(resolveCanonicalSaveDir(config, null, "x")).toBe(
      path.join(repoRoot, "var/source-specific"),
    );
    expect(DEFAULT_SAVE_DIR).toBe(path.join(repoRoot, "var", "feed-archive"));
  });

  test("resolveCanonicalSaveDir picks workset source over first enabled source", () => {
    const config: FeedConfig = {
      user_preferences: {
        sources: [
          {
            name: "x",
            enabled: true,
            capture: { save_dir: "./var/x-archive" },
          },
          {
            name: "bluesky",
            enabled: true,
            capture: { save_dir: "./var/bsky-archive" },
          },
        ],
      },
    };

    expect(resolveCanonicalSaveDir(config, null, null)).toBe(
      path.join(repoRoot, "var/x-archive"),
    );
    expect(resolveCanonicalSaveDir(config, null, "bluesky")).toBe(
      path.join(repoRoot, "var/bsky-archive"),
    );
  });
});
