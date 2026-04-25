import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_SAVE_DIR,
  getCaptureBrowserOptions,
  getCaptureDefaults,
  getCurationPreferences,
  getDefaultSource,
  getEnabledSourceNames,
  parseConfigPayload,
  getSaveDir,
  resolveCanonicalSaveDir,
} from "../../lib/config.ts";
import { normalizeBrowserOptions } from "../../lib/browser.ts";
import type { FeedConfig } from "../../lib/types.ts";

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
              browser: {},
            },
          },
        ],
        curation: {
          fallback_category: "Other",
          preferred_categories: ["Coding"],
        },
        render: {},
        summary: {},
      },
      summary: {},
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
              browser: {},
            },
          },
        ],
        render: {},
        curation: {},
        summary: {},
      },
      summary: {},
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
            capture: { save_dir: "./var/x-archive", browser: {} },
          },
          {
            name: "bluesky",
            enabled: true,
            capture: { save_dir: "./var/bsky-archive", browser: {} },
          },
        ],
        render: {},
        curation: {},
        summary: {},
      },
      summary: {},
    };

    expect(resolveCanonicalSaveDir(config, null, null)).toBe(
      path.join(repoRoot, "var/x-archive"),
    );
    expect(resolveCanonicalSaveDir(config, null, "bluesky")).toBe(
      path.join(repoRoot, "var/bsky-archive"),
    );
  });

  test("parseConfigPayload normalizes raw browser aliases at the boundary", () => {
    const config = parseConfigPayload(
      JSON.stringify({
        user_preferences: {
          sources: [
            {
              name: "x",
              capture: {
                browser: {
                  auto_connect: false,
                  browser_args: ["--no-sandbox", 12],
                  session_name: "feed-session",
                  state_path: "./tmp/browser-state.json",
                  allow_file_access: true,
                  color_scheme: "dark",
                  executable_path: "./chrome",
                },
              },
            },
          ],
        },
      }),
      "/tmp/config.json",
    );

    expect(getCaptureDefaults(config, "x")).toEqual({
      assets_dir: undefined,
      browser: {
        autoConnect: false,
        args: ["--no-sandbox", "12"],
        cdp: null,
        sessionName: "feed-session",
        session: null,
        profile: null,
        statePath: "./tmp/browser-state.json",
        headed: undefined,
        allowFileAccess: true,
        colorScheme: "dark",
        executablePath: "./chrome",
      },
      default_limit: undefined,
      save_dir: undefined,
    });
    expect(getCaptureBrowserOptions(config, "x")).not.toHaveProperty(
      "auto_connect",
    );
    expect(getCaptureBrowserOptions(config, "x")).not.toHaveProperty(
      "browser_args",
    );
    expect(getCaptureBrowserOptions(config, "x")).not.toHaveProperty(
      "session_name",
    );
  });

  test("parseConfigPayload keeps config-side string coercion behavior", () => {
    const config = parseConfigPayload(
      JSON.stringify({
        user_preferences: {
          sources: [
            {
              name: "x",
              capture: {
                browser: {
                  cdp: 9222,
                  session: 123,
                  profile: false,
                },
              },
            },
          ],
        },
      }),
      "/tmp/config.json",
    );

    expect(getCaptureBrowserOptions(config, "x")).toMatchObject({
      cdp: "9222",
      session: "123",
      profile: "false",
    });
  });

  test("parseConfigPayload returns normalized empty preference objects", () => {
    const config = parseConfigPayload("{}", "/tmp/config.json");

    expect(config.user_preferences).toEqual({
      sources: [],
      render: {},
      curation: {},
      summary: {},
    });
    expect(config.summary).toEqual({});
    expect(getEnabledSourceNames(config)).toEqual([]);
    expect(getCaptureDefaults(config, "x")).toEqual({ browser: {} });
    expect(getCurationPreferences(config)).toEqual({});
  });

  test("example config leaves browser capture on auto-connect bootstrap path", () => {
    const config = parseConfigPayload(
      fs.readFileSync(path.join(repoRoot, "config.json.example"), "utf8"),
      path.join(repoRoot, "config.json.example"),
    );

    expect(getEnabledSourceNames(config)).toContain("x");
    for (const sourceName of getEnabledSourceNames(config)) {
      const browserOptions = getCaptureBrowserOptions(config, sourceName);
      expect(browserOptions.cdp).toBeNull();
      expect(normalizeBrowserOptions(browserOptions)).toMatchObject({
        autoConnect: true,
        cdp: null,
        headed: false,
      });
    }
  });
});
