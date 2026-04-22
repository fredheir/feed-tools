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

    const sessionModule =
      (await import("../lib/browser/session.js")) as unknown as {
        toBrowserTarget: (target: string) => string;
      };
    const { toBrowserTarget } = sessionModule;

    expect(toBrowserTarget("./var/feed.html")).toBe(
      pathToFileURL(path.resolve("./var/feed.html")).href,
    );
  });
});
