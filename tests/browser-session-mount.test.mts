import path from "node:path";
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

describe("toBrowserTarget mount lookup fallback", () => {
  test("falls back to the resolved local path when findmnt is unavailable", async () => {
    execFileSync.mockImplementation(() => {
      throw new Error("spawn findmnt ENOENT");
    });

    const { toBrowserTarget } = await import("../lib/browser/session.ts");

    expect(toBrowserTarget("./var/feed.html")).toBe(
      pathToFileURL(path.resolve("./var/feed.html")).href,
    );
  });
});
