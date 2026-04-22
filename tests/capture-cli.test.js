import path from "node:path";
import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  repoRoot,
  withConfigEnv,
  writeTestConfig,
} from "./helpers/cli-config.mts";

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
});
