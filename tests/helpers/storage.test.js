import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  ensureSourceStorage,
  getSourceStoragePaths,
} from "../../lib/storage.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("storage helpers", () => {
  test("builds stable per-source storage paths", () => {
    const saveDir = path.join("/tmp", "feed-storage");
    const paths = getSourceStoragePaths(saveDir, "x", "2026-04-03T10:11:12Z");

    expect(paths).toEqual({
      sourceRoot: path.join(saveDir, "x"),
      snapshotsDir: path.join(saveDir, "x", "snapshots"),
      snapshotPath: path.join(
        saveDir,
        "x",
        "snapshots",
        "x-feed-2026-04-03-101112.json",
      ),
      latestPath: path.join(saveDir, "x", "latest.json"),
      currentPath: path.join(saveDir, "x", "current.json"),
    });
  });

  test("ensures the snapshots directory exists", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-storage-"));
    tempDirs.push(saveDir);
    const paths = getSourceStoragePaths(
      saveDir,
      "linkedin",
      "2026-04-03T10:11:12Z",
    );

    ensureSourceStorage(paths);

    expect(fs.existsSync(paths.snapshotsDir)).toBe(true);
  });
});
