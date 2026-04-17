import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildAgentBrowserArgs,
  normalizeBrowserOptions,
  sanitizeAgentBrowserOutput,
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

  test("accepts legacy config-style aliases for browser options", () => {
    const args = buildAgentBrowserArgs(
      {
        session_name: "feed",
        state: "./.auth/x.json",
        allow_file_access: true,
        color_scheme: "dark",
        executable_path: "/bin/chrome",
        browser_args: ["--no-sandbox"],
      },
      ["snapshot"],
    );

    expect(args).toEqual([
      "--session-name",
      "feed",
      "--state",
      path.join(repoRoot, ".auth/x.json"),
      "--allow-file-access",
      "--color-scheme",
      "dark",
      "--executable-path",
      "/bin/chrome",
      "--auto-connect",
      "--args",
      "--no-sandbox",
      "snapshot",
    ]);
  });

  test("normalizes config-style aliases into the runtime browser shape", () => {
    const normalized = normalizeBrowserOptions({
      auto_connect: false,
      session_name: "feed",
      state_path: "./.auth/x.json",
      allow_file_access: true,
      color_scheme: "dark",
      executable_path: "/bin/chrome",
      browser_args: ["--no-sandbox"],
    });

    expect(normalized).toMatchObject({
      autoConnect: false,
      sessionName: "feed",
      statePath: path.join(repoRoot, ".auth/x.json"),
      allowFileAccess: true,
      colorScheme: "dark",
      executablePath: "/bin/chrome",
      args: ["--no-sandbox"],
    });
  });

  test("normalizes cdp config to disable headed and auto-connect", () => {
    const runtime = normalizeBrowserOptions({
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

  test("strips repeated daemon args warnings from agent-browser output", () => {
    expect(
      sanitizeAgentBrowserOutput(`⚠ --args ignored: daemon already running. Use 'agent-browser close' first to restart with new options.
{"ok":true}
`),
    ).toBe('{"ok":true}');
  });
});
