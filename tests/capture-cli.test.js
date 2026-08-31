import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  repoRoot,
  withConfigEnv,
  writeTestConfig,
} from "./helpers/cli-config.mts";
import { loadConfig, parseConfigPayload } from "../lib/config.ts";
import { parseCaptureCliArgs } from "../lib/capture-cli.ts";

describe("feed-capture", () => {
  test("prints usage for help", () => {
    const configPath = writeTestConfig(repoRoot);
    const output = execFileSync(
      process.execPath,
      ["./bin/feed-capture", "--help"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(output).toContain("Usage: feed-capture");
  });

  test("fails fast for unsupported sources", () => {
    const configPath = writeTestConfig(repoRoot);
    const result = spawnSync(
      process.execPath,
      ["./bin/feed-capture", "mastodon"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported source: mastodon");
  });

  test.each([
    "0",
    "-1",
    "1.5",
    "12foo",
  ])("rejects invalid positional capture limit %s", (limit) => {
    const config = parseConfigPayload(
      JSON.stringify({
        user_preferences: {
          sources: [{ name: "x", capture: { browser: {} } }],
        },
      }),
      "/tmp/config.json",
    );

    expect(() =>
      parseCaptureCliArgs(["node", "feed-capture", "x", limit], config),
    ).toThrow(`Invalid limit: ${limit}`);
  });

  test("uses the default capture limit when config omits it", () => {
    const config = parseConfigPayload(
      JSON.stringify({
        user_preferences: {
          sources: [{ name: "x", capture: { browser: {} } }],
        },
      }),
      "/tmp/config.json",
    );

    expect(
      parseCaptureCliArgs(["node", "feed-capture", "x"], config).limit,
    ).toBe(12);
  });

  test("keeps per-source save dirs unless save dir is explicit", () => {
    const configPath = writeTestConfig(repoRoot, {
      user_preferences: {
        sources: [
          {
            name: "x",
            enabled: true,
            default: true,
            capture: {
              save_dir: "./var/x-archive",
              default_limit: 12,
              browser: {},
            },
          },
          {
            name: "bluesky",
            enabled: true,
            capture: {
              save_dir: "./var/bluesky-archive",
              default_limit: 12,
              browser: {},
            },
          },
        ],
      },
    });
    const previousConfigPath = process.env.FEED_TOOLS_CONFIG;
    process.env.FEED_TOOLS_CONFIG = configPath;
    try {
      const parsed = parseCaptureCliArgs(
        ["node", "feed-capture", "x", "bluesky"],
        loadConfig(),
      );

      expect(parsed.saveDir).toBeUndefined();
    } finally {
      if (previousConfigPath === undefined) {
        delete process.env.FEED_TOOLS_CONFIG;
      } else {
        process.env.FEED_TOOLS_CONFIG = previousConfigPath;
      }
    }
  });
});
