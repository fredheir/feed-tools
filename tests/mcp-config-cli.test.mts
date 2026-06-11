import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("feed-mcp-config", () => {
  test("prints a local MCP server configuration", () => {
    const result = spawnSync(
      process.execPath,
      [
        "./bin/feed-mcp-config",
        "--",
        "--client",
        "codex",
        "--workdir",
        "/tmp/feed-tools",
        "--cdp",
        "9333",
        "--profile",
        "/tmp/feed-profile",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("codex");

    const config = JSON.parse(result.stdout);
    expect(config).toEqual({
      mcpServers: {
        "feed-tools": {
          command: process.execPath,
          args: ["--experimental-strip-types", "/tmp/feed-tools/bin/feed-mcp"],
          env: {
            FEED_TOOLS_WORKDIR: "/tmp/feed-tools",
            FEED_TOOLS_CDP: "9333",
            FEED_TOOLS_CHROME_PROFILE: "/tmp/feed-profile",
          },
        },
      },
    });
  });
});
