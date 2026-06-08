import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("bin entrypoints", () => {
  test("feed-doctor runs through node on runtimes without native TypeScript loading", () => {
    const result = spawnSync(
      process.execPath,
      ["./bin/feed-doctor", "--json"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      results: expect.any(Array),
      config: expect.any(Object),
    });
  });
});
