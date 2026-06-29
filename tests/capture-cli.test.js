import path from "node:path";
import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  repoRoot,
  withConfigEnv,
  writeTestConfig,
} from "./helpers/cli-config.mts";

describe("feed-capture", () => {
  test("keeps source defaults source-owned and CLI overrides explicit", () => {
    const cli = fs.readFileSync(
      path.join(repoRoot, "lib/capture-cli.ts"),
      "utf8",
    );

    expect(cli).not.toContain("let saveDir = resolveCanonicalSaveDir(");
    expect(cli).not.toContain("let assetsDir = getAssetsDir(");
    expect(cli).not.toContain(
      "let browserOptions = getCaptureBrowserOptions(config, primarySource);",
    );
    expect(cli).toContain(
      'let saveDir = sourceNames.length > 1 ? getSaveDir(config) : "";',
    );
    expect(cli).toContain('let assetsDir = "";');
    expect(cli).toContain("let browserOptions: FeedBrowserConfig = {};");
    expect(cli).toContain("...(sourceBrowserDefaults.args || []),");
    expect(cli).toContain("...(browserOptions.args || []),");
  });

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
