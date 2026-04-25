import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import {
  browserUrlMatchesTarget,
  createBrowserSession,
  toBrowserTarget,
  translateMountedPath,
} from "../lib/browser/session.ts";

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

describe("browserUrlMatchesTarget", () => {
  test("accepts redirected homepage query parameters", () => {
    expect(
      browserUrlMatchesTarget(
        "https://www.tiktok.com/?is_from_webapp=1&sender_device=pc",
        "https://www.tiktok.com/",
      ),
    ).toBe(true);
  });

  test("keeps explicit query strings exact", () => {
    expect(
      browserUrlMatchesTarget(
        "https://www.youtube.com/?app=desktop",
        "https://www.youtube.com/?app=feed",
      ),
    ).toBe(false);
  });

  test("does not accept same-domain different paths", () => {
    expect(
      browserUrlMatchesTarget(
        "https://www.tiktok.com/@demo/video/123",
        "https://www.tiktok.com/",
      ),
    ).toBe(false);
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

  test("ensureUrl reuses exact tabs and does not accept same-domain pages", () => {
    const calls = [];
    let currentUrl = "https://www.tiktok.com/@demo/video/123";
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: (commandArgs) => {
          calls.push(commandArgs);
          if (commandArgs[0] === "get" && commandArgs[1] === "url") {
            return currentUrl;
          }
          if (commandArgs[0] === "tab" && commandArgs[1] === "list") {
            return JSON.stringify({
              data: {
                tabs: [
                  { index: 1, url: "https://www.tiktok.com/@demo/video/123" },
                  { index: 2, url: "https://www.tiktok.com/" },
                ],
              },
            });
          }
          if (commandArgs[0] === "tab" && commandArgs[1] === "2") {
            currentUrl = "https://www.tiktok.com/";
            return "";
          }
          return "";
        },
      },
      {},
    );

    expect(session.ensureUrl("https://www.tiktok.com/")).toBe(
      "https://www.tiktok.com/",
    );
    expect(calls).toContainEqual(["tab", "2"]);
    expect(calls).not.toContainEqual(["tab", "new", "https://www.tiktok.com/"]);
  });

  test("ensureUrl accepts redirected homepage query parameters", () => {
    const calls = [];
    let currentUrl = "about:blank";
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: (commandArgs) => {
          calls.push(commandArgs);
          if (commandArgs[0] === "get" && commandArgs[1] === "url") {
            return currentUrl;
          }
          if (commandArgs[0] === "tab" && commandArgs[1] === "list") {
            return JSON.stringify({
              data: {
                tabs: [
                  {
                    index: 1,
                    url: "https://www.tiktok.com/?is_from_webapp=1",
                  },
                ],
              },
            });
          }
          if (commandArgs[0] === "tab" && commandArgs[1] === "1") {
            currentUrl = "https://www.tiktok.com/?is_from_webapp=1";
            return "";
          }
          return "";
        },
      },
      {},
    );

    expect(session.ensureUrl("https://www.tiktok.com/")).toBe(
      "https://www.tiktok.com/?is_from_webapp=1",
    );
    expect(calls).toContainEqual(["tab", "1"]);
    expect(calls).not.toContainEqual(["tab", "new", "https://www.tiktok.com/"]);
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

  test("tryWaitForFunction returns false for child process ETIMEDOUT", () => {
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: () => {
          throw new Error("spawnSync agent-browser ETIMEDOUT");
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

  test("tryWaitForFunction does not treat the timeout flag as a timeout error", () => {
    const session = createBrowserSession(
      {
        normalizeBrowserOptions: (options = {}) => options,
        runAgentBrowser: () => {
          throw new Error(
            "Command failed: agent-browser wait --fn window.ready --timeout 100\nCDP connection closed",
          );
        },
      },
      {},
    );

    expect(() => session.tryWaitForFunction("window.ready", 100)).toThrow(
      "CDP connection closed",
    );
  });
});
