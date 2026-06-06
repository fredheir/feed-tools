import { describe, expect, test } from "vitest";

import {
  applyBrowserConfigToPayload,
  recommendedBrowserConfig,
} from "../lib/doctor-service.ts";

describe("doctor service helpers", () => {
  test("prefers a working CDP endpoint over agent-browser", () => {
    expect(
      recommendedBrowserConfig([
        {
          name: "agent-browser",
          ok: true,
          detail: "agent-browser responded",
        },
        {
          name: "cdp:9223",
          ok: true,
          detail: "Chrome at http://127.0.0.1:9223/json/version",
          recommendation: 'Set capture.browser.cdp to "9223".',
        },
      ]),
    ).toEqual({ cdp: "9223" });
  });

  test("falls back to agent-browser when CDP is unavailable", () => {
    expect(
      recommendedBrowserConfig([
        {
          name: "cdp:9223",
          ok: false,
          detail: "not available",
        },
        {
          name: "agent-browser",
          ok: true,
          detail: "agent-browser responded",
        },
      ]),
    ).toEqual({});
  });

  test("applies the recommended browser config to all source entries", () => {
    const payload = JSON.stringify({
      user_preferences: {
        sources: [
          { name: "x", capture: { default_limit: 12, browser: {} } },
          { name: "linkedin", capture: { browser: { headed: true } } },
        ],
      },
    });

    expect(JSON.parse(applyBrowserConfigToPayload(payload, { cdp: "9223" })))
      .toMatchObject({
        user_preferences: {
          sources: [
            { capture: { browser: { cdp: "9223" } } },
            { capture: { browser: { cdp: "9223" } } },
          ],
        },
      });
  });
});
