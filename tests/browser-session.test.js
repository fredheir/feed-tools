import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import {
  createBrowserSession,
  toBrowserTarget,
  translateMountedPath,
} from "../lib/browser/session.js";

describe("translateMountedPath", () => {
  test("returns the original resolved path when the mount source is not host-backed", () => {
    const resolvedPath = path.resolve("./var/feed.html");

    expect(
      translateMountedPath(resolvedPath, {
        target: "/",
        source: "/dev/nvme1n1p2",
      }),
    ).toBe(resolvedPath);
  });

  test("translates a bind-mounted sandbox path to its host-visible path", () => {
    expect(
      translateMountedPath("/sessions/abc/mnt/temp/feed-tools/var/feed.html", {
        target: "/sessions/abc/mnt/temp",
        source: "[/home/rolf/Downloads/temp]",
      }),
    ).toBe("/home/rolf/Downloads/temp/feed-tools/var/feed.html");
  });

  test("returns the original path when the file is outside the mounted subtree", () => {
    expect(
      translateMountedPath("/sessions/other/feed-tools/var/feed.html", {
        target: "/sessions/abc/mnt/temp",
        source: "[/home/rolf/Downloads/temp]",
      }),
    ).toBe("/sessions/other/feed-tools/var/feed.html");
  });
});

describe("toBrowserTarget", () => {
  test("leaves existing urls unchanged", () => {
    expect(toBrowserTarget("https://example.com/feed")).toBe(
      "https://example.com/feed",
    );
  });

  test("builds a file url for a local path", () => {
    expect(toBrowserTarget("./var/feed.html")).toBe(
      pathToFileURL(path.resolve("./var/feed.html")).href,
    );
  });
});

describe("createBrowserSession", () => {
  test("keeps parsed mount and tab url fields string-strict", () => {
    const calls = [];
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: (commandArgs) => {
          calls.push(commandArgs);
          if (commandArgs[0] === "tab") {
            return JSON.stringify({
              data: {
                tabs: [
                  { index: 1, url: 42 },
                  { index: 2, url: "https://x.com" },
                ],
              },
            });
          }
          return JSON.stringify({
            filesystems: [{ target: 42, source: ["/host"] }],
          });
        },
      },
      {},
    );

    expect(session.listTabs()).toEqual([
      { index: 1 },
      { index: 2, url: "https://x.com" },
    ]);
    expect(calls).toEqual([["tab", "list", "--json"]]);
  });

  test("tryWaitForFunction returns false for wait timeouts", () => {
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: () => {
          throw new Error("TimeoutError: waiting for function timed out");
        },
      },
      {},
    );

    expect(session.tryWaitForFunction("window.ready", 100)).toBe(false);
  });

  test("tryWaitForFunction rethrows unexpected browser failures", () => {
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: () => {
          throw new Error("CDP connection closed");
        },
      },
      {},
    );

    expect(() => session.tryWaitForFunction("window.ready", 100)).toThrow(
      "CDP connection closed",
    );
  });
});
