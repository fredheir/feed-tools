import { describe, expect, test } from "vitest";

import { recommendedBrowserConfig } from "../lib/doctor-service.ts";

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
});
