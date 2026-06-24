import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { captureBrowserFeed } from "../lib/browser-feed-capture.ts";
import {
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  assertFeedUrlAccessible,
  CaptureAccessError,
  normalizeDocument,
  persistCapturedDocument,
  runSourceCapture,
} from "../lib/source-capture.ts";
import { exportDocumentsFromDb, getDatabasePath } from "../lib/sqlite-store.ts";
import { readFixture, repoRoot } from "./helpers/cli-config.mts";

const tempDirs = [];

function fakeBrowserSession(overrides = {}) {
  return {
    options: {},
    run() {
      return "";
    },
    getCurrentUrl() {
      return "https://example.com/feed";
    },
    getTitle() {
      return "Feed";
    },
    listTabs() {
      return [];
    },
    switchToTab() {},
    openNewTab() {},
    openPathOrUrl() {},
    reloadCurrentTab() {},
    waitMilliseconds() {},
    waitForLoad() {},
    tryWaitForLoad() {
      return true;
    },
    waitForUrl() {},
    waitForText() {},
    tryWaitForText() {
      return true;
    },
    waitForFunction() {},
    tryWaitForFunction() {
      return true;
    },
    waitForSelector() {},
    ensureTab() {
      return "https://example.com/feed";
    },
    ensureUrl() {
      return "https://example.com/feed";
    },
    evalJson() {
      return {};
    },
    evalText() {
      return "";
    },
    snapshotText() {
      return "";
    },
    getHtml() {
      return "";
    },
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("runSourceCapture", () => {
  test("normalizes and persists merged source documents", async () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-test-"));
    tempDirs.push(saveDir);
    const seenOptions = [];

    const adapter = {
      name: "demo",
      async captureDocument(options) {
        seenOptions.push(options);
        return {
          captured_at: "2026-04-03T10:00:00Z",
          items: [
            {
              source_item_id: "42",
              url: "https://example.com/posts/42",
              content: { text: "hello world" },
              author: { handle: "@demo" },
              stats: { like: "9" },
            },
          ],
        };
      },
    };

    const document = await runSourceCapture(adapter, {
      saveDir,
      browserOptions: {
        session: "demo-session",
        autoConnect: true,
        profile: "./profiles/demo",
        statePath: "./state/demo.json",
        headed: true,
      },
    });

    expect(seenOptions).toHaveLength(1);
    expect(seenOptions[0]).toMatchObject({
      limit: 12,
      browserOptions: {
        session: "demo-session",
        autoConnect: true,
        profile: path.join(repoRoot, "profiles/demo"),
        statePath: path.join(repoRoot, "state/demo.json"),
        headed: true,
      },
    });

    expect(document.source).toBe("demo");
    expect(document.items).toHaveLength(1);
    expect(document.items[0]).toMatchObject({
      id: "demo:42",
      source: "demo",
      source_item_id: "42",
      index: 1,
      content: { text: "hello world" },
      stats: { like: "9" },
      first_seen_at: "2026-04-03T10:00:00Z",
      last_seen_at: "2026-04-03T10:00:00Z",
      capture_count: 1,
    });
    expect(document.items[0]).not.toHaveProperty("text");
    expect(document.items[0]).not.toHaveProperty("profile_image_url");
    expect(document.items[0]).not.toHaveProperty("embedded_media");
    expect(document.items[0]).not.toHaveProperty("preview_cards");

    const currentPath = path.join(saveDir, "demo", "current.json");
    expect(fs.existsSync(currentPath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(currentPath, "utf8"));
    expect(persisted.items[0].id).toBe("demo:42");

    const dbPath = getDatabasePath(saveDir);
    expect(fs.existsSync(dbPath)).toBe(true);

    const exported = exportDocumentsFromDb(saveDir, { sources: ["demo"] });
    expect(exported).toEqual(document);
  });

  test("fails closed when a source extracts zero items", async () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-test-"));
    tempDirs.push(saveDir);

    await expect(
      runSourceCapture(
        {
          name: "demo",
          async captureDocument() {
            return {
              schema_version: 1,
              source: "demo",
              captured_at: "2026-04-03T10:00:00Z",
              items: [],
            };
          },
        },
        { saveDir },
      ),
    ).rejects.toThrow(/no items were extracted/);
  });

  test("raises a capture access error when a protected feed resolves to login chrome", () => {
    expect(() =>
      assertAuthenticatedCapture(
        {
          sourceName: "x",
          browser: {
            getCurrentUrl() {
              return "https://x.com/i/flow/login";
            },
            snapshotText() {
              return "Log in to continue";
            },
          },
          document: { items: [] },
        },
        {
          blockedUrlPatterns: [/\/i\/flow\/login/i],
          blockedTextPatterns: [/\blog in\b/i],
        },
      ),
    ).toThrow(CaptureAccessError);
  });

  test("raises a capture access error when a blocked page is detected before extraction", () => {
    expect(() =>
      assertFeedPageAccessible(
        {
          sourceName: "linkedin",
          browser: {
            getCurrentUrl() {
              return "https://www.linkedin.com/authwall";
            },
            snapshotText() {
              return "Join now";
            },
          },
        },
        {
          blockedUrlPatterns: [/\/authwall/i],
          blockedTextPatterns: [/\bjoin now\b/i],
        },
      ),
    ).toThrow(CaptureAccessError);
  });

  test("flags an x login-wall snapshot using the canonical source policy", () => {
    const snapshot = readFixture("access", "x-login.txt");

    expect(() =>
      assertAuthenticatedCapture({
        sourceName: "x",
        browser: {
          getCurrentUrl() {
            return "https://x.com/i/flow/login";
          },
          snapshotText() {
            return snapshot;
          },
        },
        document: { items: [] },
      }),
    ).toThrow(CaptureAccessError);
  });

  test("flags an instagram login page using the canonical source policy", () => {
    expect(() =>
      assertFeedUrlAccessible({
        sourceName: "instagram",
        browser: {
          getCurrentUrl() {
            return "https://www.instagram.com/accounts/login/";
          },
          snapshotText() {
            return "";
          },
        },
      }),
    ).toThrow(CaptureAccessError);
  });

  test("flags a linkedin authwall snapshot using the canonical source policy", () => {
    const snapshot = readFixture("access", "linkedin-authwall.txt");

    expect(() =>
      assertFeedPageAccessible({
        sourceName: "linkedin",
        browser: {
          getCurrentUrl() {
            return "https://www.linkedin.com/authwall";
          },
          snapshotText() {
            return snapshot;
          },
        },
      }),
    ).toThrow(CaptureAccessError);
  });

  test("rejects a document whose declared source does not match the capture boundary", () => {
    expect(() =>
      normalizeDocument(
        {
          schema_version: 1,
          source: "linkedin",
          captured_at: "2026-04-18T10:00:00Z",
          items: [],
        },
        "x",
      ),
    ).toThrow(/document source must match source "x"/);
  });

  test("rejects persistence of documents that were not standardized at the boundary", async () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-tools-test-"));
    tempDirs.push(saveDir);

    await expect(
      persistCapturedDocument(
        {
          schema_version: 1,
          source: "x",
          captured_at: null,
          items: [],
        },
        {
          sourceName: "x",
          assetsDir: "",
          saveDir,
        },
      ),
    ).rejects.toThrow(/captured_at must be a non-empty string/);
  });
});

describe("captureBrowserFeed", () => {
  test("assembles a limited document from collected batches", async () => {
    const browser = fakeBrowserSession();
    const prepareCalls = [];

    const document = await captureBrowserFeed({
      sourceName: "demo",
      limit: 2,
      createSession(options) {
        expect(options).toEqual({ session: "demo" });
        return browser;
      },
      browserOptions: { session: "demo" },
      prepareFeed(session) {
        expect(session).toBe(browser);
        prepareCalls.push("prepare");
      },
      captureBatch({ collectItems }) {
        collectItems([
          { source: "demo", source_item_id: "a", index: 1 },
          { source: "demo", source_item_id: "b", index: 2 },
          { source: "demo", source_item_id: "c", index: 3 },
        ]);
      },
    });

    expect(prepareCalls).toEqual(["prepare"]);
    expect(document).toMatchObject({
      schema_version: 1,
      source: "demo",
      items: [
        { source_item_id: "a", index: 1 },
        { source_item_id: "b", index: 2 },
      ],
    });
    expect(document.captured_at).toEqual(expect.any(String));
  });

  test("re-prepares and retries once when the first batch is empty", async () => {
    let captureCalls = 0;
    const prepareCalls = [];

    const document = await captureBrowserFeed({
      sourceName: "demo",
      createSession: () => fakeBrowserSession(),
      prepareFeed() {
        prepareCalls.push("prepare");
      },
      captureBatch({ collectItems }) {
        captureCalls += 1;
        if (captureCalls === 2) {
          collectItems([{ source: "demo", source_item_id: "retry", index: 1 }]);
        }
      },
    });

    expect(prepareCalls).toEqual(["prepare", "prepare"]);
    expect(captureCalls).toBe(2);
    expect(document.items).toHaveLength(1);
    expect(document.items[0].source_item_id).toBe("retry");
  });

  test("dedupes across batches and passes final document to afterCapture", async () => {
    const afterCaptureCalls = [];

    const document = await captureBrowserFeed({
      sourceName: "demo",
      createSession: () => fakeBrowserSession({ getTitle: () => "Demo Feed" }),
      prepareFeed() {},
      captureBatch({ collectItems }) {
        collectItems([
          { source: "demo", source_item_id: "same", index: 1 },
          { source: "demo", source_item_id: "same", index: 2 },
        ]);
        collectItems([{ source: "demo", source_item_id: "next", index: 3 }]);
      },
      afterCapture({ browser, document }) {
        afterCaptureCalls.push({
          title: browser.getTitle(),
          ids: document.items.map((item) => item.source_item_id),
        });
      },
    });

    expect(document.items.map((item) => item.source_item_id)).toEqual([
      "same",
      "next",
    ]);
    expect(afterCaptureCalls).toEqual([
      { title: "Demo Feed", ids: ["same", "next"] },
    ]);
  });
});
