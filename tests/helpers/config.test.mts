import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_SAVE_DIR,
  defaultConfigTemplatePath,
  findConfigTemplatePath,
  getCaptureBrowserOptions,
  getCaptureDefaults,
  getCurationPreferences,
  getDefaultSource,
  getEnabledSourceNames,
  parseConfigPayload,
  readConfigDocument,
  getSaveDir,
  resolveCanonicalSaveDir,
  writeConfigFromPreferences,
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

  test("parseConfigPayload normalizes canonical browser options at the boundary", () => {
    const config = parseConfigPayload(
      JSON.stringify({
        user_preferences: {
          sources: [
            {
              name: "x",
              capture: {
                browser: {
                  autoConnect: false,
                  args: ["--no-sandbox", 12],
                  sessionName: "feed-session",
                  statePath: "./tmp/browser-state.json",
                  allowFileAccess: true,
                  colorScheme: "dark",
                  executablePath: "./chrome",
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

  test("writes preference updates from the config owner", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-config-"));
    const targetPath = path.join(workdir, "config.json");

    const result = writeConfigFromPreferences({
      targetPath,
      templatePath: path.join(repoRoot, "config.json.example"),
      overwrite: true,
      sources: [
        { name: "x", default_limit: 5 },
        { name: "bluesky", enabled: false },
      ],
      browser: { cdp: "9223" },
      render: { show_tabs: false },
      curation: { target_items_per_tab: 4 },
      summary: { custom_instructions: "Prefer short bullets." },
    });

    expect(result).toMatchObject({
      ok: true,
      written: true,
      path: targetPath,
      sourcesEnabled: ["x"],
      preferenceSectionsWritten: 3,
      browser: { cdp: "9223" },
    });
    const config = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    expect(config).toMatchObject({
      user_preferences: {
        render: { show_tabs: false },
        curation: { target_items_per_tab: 4 },
        summary: { custom_instructions: "Prefer short bullets." },
      },
    });
    expect(
      config.user_preferences.sources.find(
        (source: { name?: string }) => source.name === "x",
      ),
    ).toMatchObject({
      enabled: true,
      capture: { default_limit: 5, browser: { cdp: "9223" } },
    });
    expect(
      config.user_preferences.sources.find(
        (source: { name?: string }) => source.name === "bluesky",
      ),
    ).toMatchObject({ enabled: false });
  });

  test("writes browser preferences from the template when requested", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-config-"));
    const targetPath = path.join(workdir, "config.json");
    const templatePath = path.join(workdir, "config.json.example");

    fs.writeFileSync(
      targetPath,
      `${JSON.stringify({
        user_preferences: {
          sources: [{ name: "x", capture: { browser: { headed: true } } }],
        },
      })}\n`,
      "utf8",
    );
    fs.writeFileSync(
      templatePath,
      `${JSON.stringify({
        user_preferences: {
          sources: [
            { name: "x", capture: { default_limit: 12, browser: {} } },
            { name: "linkedin", capture: { browser: { headed: true } } },
          ],
        },
      })}\n`,
      "utf8",
    );

    writeConfigFromPreferences({
      targetPath,
      templatePath,
      overwrite: true,
      useExistingTargetAsTemplate: false,
      browser: { cdp: "9223" },
    });

    expect(JSON.parse(fs.readFileSync(targetPath, "utf8"))).toMatchObject({
      user_preferences: {
        sources: [
          { capture: { default_limit: 12, browser: { cdp: "9223" } } },
          { capture: { browser: { cdp: "9223" } } },
        ],
      },
    });
  });

  test("selects config templates from the config owner", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-config-"));
    const targetPath = path.join(workdir, "nested", "config.json");
    const workdirTemplatePath = path.join(workdir, "config.json.example");
    const targetTemplatePath = path.join(
      path.dirname(targetPath),
      "config.json.example",
    );
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    fs.writeFileSync(targetTemplatePath, "{}\n", "utf8");
    expect(findConfigTemplatePath(targetPath, workdir)).toBe(
      targetTemplatePath,
    );
    expect(defaultConfigTemplatePath(targetPath, workdir)).toBe(
      targetTemplatePath,
    );

    fs.writeFileSync(workdirTemplatePath, "{}\n", "utf8");
    expect(findConfigTemplatePath(targetPath, workdir)).toBe(
      workdirTemplatePath,
    );
  });

  test("reads raw config documents from the config owner", () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-config-read-"));
    const targetPath = path.join(workdir, "config.json");

    expect(readConfigDocument(targetPath)).toMatchObject({
      ok: true,
      path: targetPath,
      exists: false,
      config: null,
    });

    fs.writeFileSync(
      targetPath,
      `${JSON.stringify({ user_preferences: { sources: [{ name: "x" }] } })}\n`,
      "utf8",
    );

    expect(readConfigDocument(targetPath)).toMatchObject({
      ok: true,
      path: targetPath,
      exists: true,
      config: { user_preferences: { sources: [{ name: "x" }] } },
    });
  });
});
