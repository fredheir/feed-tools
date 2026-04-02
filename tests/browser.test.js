import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildAgentBrowserArgs,
  getRuntimeBrowserOptions,
} from "../lib/browser.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("buildAgentBrowserArgs", () => {
  test("builds session-oriented browser args from config-style options", () => {
    const args = buildAgentBrowserArgs(
      {
        autoConnect: false,
        session: "feed-x",
        sessionName: "feed",
        statePath: "./.auth/x.json",
        profile: "./.profiles/x",
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        headed: true,
      },
      ["snapshot", "-i"],
    );

    expect(args).toEqual([
      "--session",
      "feed-x",
      "--session-name",
      "feed",
      "--profile",
      path.join(repoRoot, ".profiles/x"),
      "--state",
      path.join(repoRoot, ".auth/x.json"),
      "--headed",
      "--args",
      "--no-sandbox,--disable-dev-shm-usage",
      "snapshot",
      "-i",
    ]);
  });

  test("keeps auto-connect enabled by default for ad hoc browsing", () => {
    const args = buildAgentBrowserArgs({}, ["get", "url"]);
    expect(args).toEqual(["--auto-connect", "get", "url"]);
  });

  test("treats cdp as mutually exclusive with headed and auto-connect", () => {
    const args = buildAgentBrowserArgs(
      {
        cdp: "9222",
        headed: true,
        autoConnect: true,
      },
      ["snapshot", "-i"],
    );

    expect(args).toEqual(["--cdp", "9222", "snapshot", "-i"]);
  });

  test("strips startup-only options from runtime session reuse", () => {
    const runtime = getRuntimeBrowserOptions({
      auto_connect: false,
      session: "feed-x",
      state_path: "./.auth/x.json",
      profile: "./.profiles/x",
      args: ["--no-sandbox"],
      headed: true,
    });

    expect(runtime).toMatchObject({
      autoConnect: false,
      session: "feed-x",
      statePath: null,
      profile: null,
      args: [],
      headed: false,
    });
  });

  test("normalizes cdp config to disable headed and auto-connect", () => {
    const runtime = getRuntimeBrowserOptions({
      cdp: "9222",
      auto_connect: true,
      headed: true,
    });

    expect(runtime).toMatchObject({
      cdp: "9222",
      autoConnect: false,
      headed: false,
    });
  });
});
