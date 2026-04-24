import { describe, expect, test } from "vitest";

import {
  applyBrowserConfigToPayload,
  detectSandboxSignals,
  recommendedBrowserConfig,
  redactRemoteUrl,
} from "../lib/doctor-cli.js";

describe("feed-doctor config helpers", () => {
  test("prefers agent-browser by writing empty browser config", () => {
    expect(
      recommendedBrowserConfig([
        { name: "agent-browser", ok: true, detail: "agent-browser 0.23.4" },
        { name: "cdp:9222", ok: true, detail: "Chrome" },
      ]),
    ).toEqual({});
  });

  test("falls back to verified CDP when agent-browser is unavailable", () => {
    expect(
      recommendedBrowserConfig([
        { name: "agent-browser", ok: false, detail: "missing" },
        { name: "cdp:9223", ok: true, detail: "Chrome" },
      ]),
    ).toEqual({ cdp: "9223" });
  });

  test("updates every source browser block while preserving preferences", () => {
    const payload = JSON.stringify({
      version: 1,
      user_preferences: {
        sources: [
          {
            name: "x",
            default: true,
            capture: {
              default_limit: 12,
              assets_dir: "./var/feed-assets",
              save_dir: "./var/feed-archive",
              browser: { cdp: "9222", args: ["--no-sandbox"] },
            },
          },
          {
            name: "bluesky",
            enabled: false,
            capture: {
              save_dir: "./var/feed-archive",
              browser: { headed: true },
            },
          },
        ],
        render: { show_tabs: true },
        curation: { fallback_category: "Other" },
        summary: {},
      },
    });

    const config = JSON.parse(applyBrowserConfigToPayload(payload, {}));

    expect(config.user_preferences.sources[0]).toMatchObject({
      name: "x",
      default: true,
      capture: {
        default_limit: 12,
        assets_dir: "./var/feed-assets",
        save_dir: "./var/feed-archive",
        browser: {},
      },
    });
    expect(config.user_preferences.sources[1]).toMatchObject({
      name: "bluesky",
      enabled: false,
      capture: {
        save_dir: "./var/feed-archive",
        browser: {},
      },
    });
    expect(config.user_preferences.render).toEqual({ show_tabs: true });
    expect(config.user_preferences.curation).toEqual({
      fallback_category: "Other",
    });
  });

  test("detects explicit sandbox environment markers", () => {
    expect(
      detectSandboxSignals({
        CODEX_SANDBOX: "1",
        HOME: process.env.HOME,
      }).some((signal) => signal.name === "CODEX_SANDBOX"),
    ).toBe(true);
  });

  test("redacts credentialed HTTPS remotes before reporting them", () => {
    expect(
      redactRemoteUrl("https://oauth2:ghp_secret@example.com/org/repo.git"),
    ).toBe("https://redacted:redacted@example.com/org/repo.git");
    expect(redactRemoteUrl("git@example.com:org/repo.git")).toBe(
      "git@example.com:org/repo.git",
    );
  });
});
