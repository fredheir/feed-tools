import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  assertAuthenticatedCapture,
  assertFeedPageAccessible,
  assertFeedUrlAccessible,
  CaptureAccessError,
  normalizeDocument,
  persistCapturedDocument,
  runSourceCapture,
} from "../lib/source-capture.js";
import { exportDocumentsFromDb, getDatabasePath } from "../lib/sqlite-store.js";
import { readFixture, repoRoot } from "./helpers/cli-config.mts";

const tempDirs = [];

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
        autoConnect: false,
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
        autoConnect: false,
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

  test("flags an x login-wall snapshot using the same boundary signals as the source", () => {
    const snapshot = readFixture("access", "x-login.txt");

    expect(() =>
      assertAuthenticatedCapture(
        {
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
        },
        {
          blockedUrlPatterns: [/\/i\/flow\/login/i],
          blockedTextPatterns: [/\blog in\b/i, /\bsign in\b/i],
        },
      ),
    ).toThrow(CaptureAccessError);
  });

  test("flags an instagram login page before extraction", () => {
    const snapshot = readFixture("access", "instagram-login.txt");

    expect(() =>
      assertFeedUrlAccessible(
        {
          sourceName: "instagram",
          browser: {
            getCurrentUrl() {
              return "https://www.instagram.com/accounts/login/";
            },
            snapshotText() {
              return snapshot;
            },
          },
        },
        {
          blockedUrlPatterns: [
            /\/accounts\/login/i,
            /\/challenge\//i,
            /\/checkpoint\//i,
          ],
        },
      ),
    ).toThrow(CaptureAccessError);
  });

  test("flags a linkedin authwall snapshot before extraction", () => {
    const snapshot = readFixture("access", "linkedin-authwall.txt");

    expect(() =>
      assertFeedPageAccessible(
        {
          sourceName: "linkedin",
          browser: {
            getCurrentUrl() {
              return "https://www.linkedin.com/authwall";
            },
            snapshotText() {
              return snapshot;
            },
          },
        },
        {
          blockedUrlPatterns: [/\/login/i, /\/authwall/i],
          blockedTextPatterns: [/\bsign in\b/i, /\bjoin now\b/i],
        },
      ),
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
