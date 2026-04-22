import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

const execFileSync = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync,
}));

afterEach(() => {
  execFileSync.mockReset();
  vi.resetModules();
});

const require = createRequire(import.meta.url);

describe("toBrowserTarget mount lookup fallback", () => {
  test("falls back to the resolved local path when findmnt is unavailable", async () => {
    execFileSync.mockImplementation(() => {
      throw new Error("spawn findmnt ENOENT");
    });

    const sessionModule = require("../lib/browser/session.js") as {
      toBrowserTarget: (target: string) => string;
    };
    const { toBrowserTarget } = sessionModule;

    expect(toBrowserTarget("./var/feed.html")).toBe(
      pathToFileURL(path.resolve("./var/feed.html")).href,
    );
  });
});
