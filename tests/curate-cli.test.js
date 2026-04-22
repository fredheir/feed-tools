import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  persistSourceDocument,
  saveAllocationToDb,
} from "../lib/sqlite-store.js";
import {
  repoRoot,
  withConfigEnv,
  writeTestConfig,
} from "./helpers/cli-config.mts";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("feed-curate", () => {
  test("exports a sqlite-backed document and prints categorized rows", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-curate-test-"));
    tempDirs.push(saveDir);
    const configPath = writeTestConfig(repoRoot);
    const outputPath = path.join(saveDir, "workset.json");

    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        {
          id: "x:1",
          source: "x",
          author: { handle: "@a" },
          content: { text: "Needs review" },
          stats: {},
        },
      ],
    };
    persistSourceDocument(saveDir, {
      sourceName: "x",
      document,
    });
    saveAllocationToDb(saveDir, document, {
      version: 1,
      source: "x",
      items: {
        "x:1": {
          category: "Coding",
          updated_at: "2026-04-03T12:00:00Z",
        },
      },
    });

    const stdout = execFileSync(
      process.execPath,
      [
        "./lib/curate-cli.js",
        outputPath,
        "--save-dir",
        saveDir,
        "--source",
        "x",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(JSON.parse(fs.readFileSync(outputPath, "utf8")).items).toHaveLength(
      1,
    );
    expect(stdout).toContain(outputPath);
    expect(stdout).toContain("Coding");
    expect(stdout).toContain("x:1");
  });

  test("prints a classification prompt for uncategorized items", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-curate-test-"));
    tempDirs.push(saveDir);
    const configPath = writeTestConfig(repoRoot);
    const outputPath = path.join(saveDir, "workset.json");

    persistSourceDocument(saveDir, {
      sourceName: "x",
      document: {
        schema_version: 1,
        source: "x",
        captured_at: "2026-04-03T10:00:00Z",
        items: [
          {
            id: "x:2",
            source: "x",
            author: { handle: "@uncat" },
            content: { text: "Uncategorized post text" },
            stats: { like: "7", share: "2", view: "100" },
            url: "https://x.com/uncat/status/2",
          },
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "./lib/curate-cli.js",
        outputPath,
        "--save-dir",
        saveDir,
        "--source",
        "x",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain("ERROR: classification step incomplete.");
    expect(result.stdout).toContain("Requested categories:");
    expect(result.stdout).toContain("Coding");
    expect(result.stdout).toContain("Politics");
    expect(result.stdout).toContain("Finance");
    expect(result.stdout).toContain("Friends and Family");
    expect(result.stdout).toContain("Fallback: Other.");
    expect(result.stdout).toContain(
      "run feed-classify --category Label:rows with explicit row assignments only",
    );
    expect(result.stdout).toContain("x\tx:2\t@uncat\tUncategorized post text");
    expect(result.stdout).toContain("https://x.com/uncat/status/2");
  });

  test("fails selection flow when uncategorized items exist", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-curate-test-"));
    tempDirs.push(saveDir);
    const configPath = writeTestConfig(repoRoot);
    const outputPath = path.join(saveDir, "workset.json");

    persistSourceDocument(saveDir, {
      sourceName: "x",
      document: {
        schema_version: 1,
        source: "x",
        captured_at: "2026-04-03T10:00:00Z",
        items: [
          {
            id: "x:3",
            source: "x",
            author: { handle: "@uncat" },
            content: { text: "Needs category" },
            stats: {},
          },
        ],
      },
    });

    const result = spawnSync(
      process.execPath,
      [
        "./lib/curate-cli.js",
        outputPath,
        "--save-dir",
        saveDir,
        "--source",
        "x",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toContain("ERROR: classification step incomplete.");
    expect(result.stdout).toContain(
      "run feed-classify --category Label:rows with explicit row assignments only",
    );
  });

  test("prints render context on successful curate", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-curate-test-"));
    tempDirs.push(saveDir);
    const configPath = writeTestConfig(repoRoot);
    const outputPath = path.join(saveDir, "workset.json");

    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        {
          id: "x:4",
          source: "x",
          author: { handle: "@uncat" },
          content: { text: "Needs category" },
          stats: {},
        },
      ],
    };
    persistSourceDocument(saveDir, {
      sourceName: "x",
      document,
    });
    saveAllocationToDb(saveDir, document, {
      version: 1,
      source: "x",
      items: {
        "x:4": {
          category: "Politics",
          updated_at: "2026-04-03T12:00:00Z",
        },
      },
    });

    const stdout = execFileSync(
      process.execPath,
      [
        "./lib/curate-cli.js",
        outputPath,
        "--save-dir",
        saveDir,
        "--source",
        "x",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(stdout).toContain("Render context:");
    expect(stdout).toContain("show_summary=");
    expect(stdout).toContain("preferred_categories=");
    expect(stdout).toContain("Politics");
    expect(stdout).toContain("x:4");
  });

  test("filters row output with repeated --matches batteries", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-curate-test-"));
    tempDirs.push(saveDir);
    const configPath = writeTestConfig(repoRoot);
    const outputPath = path.join(saveDir, "workset.json");

    const document = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-03T10:00:00Z",
      items: [
        {
          id: "x:5",
          source: "x",
          author: { handle: "@oil" },
          content: { text: "Iran war is moving oil markets" },
          stats: {},
          url: "https://x.com/oil/status/5",
        },
        {
          id: "x:6",
          source: "x",
          author: { handle: "@code" },
          content: { text: "new compiler release" },
          stats: {},
          url: "https://x.com/code/status/6",
        },
      ],
    };
    persistSourceDocument(saveDir, {
      sourceName: "x",
      document,
    });
    saveAllocationToDb(saveDir, document, {
      version: 1,
      source: "x",
      items: {
        "x:5": { category: "Politics", updated_at: "2026-04-03T12:00:00Z" },
        "x:6": { category: "Coding", updated_at: "2026-04-03T12:00:00Z" },
      },
    });

    const stdout = execFileSync(
      process.execPath,
      [
        "./lib/curate-cli.js",
        outputPath,
        "--save-dir",
        saveDir,
        "--source",
        "x",
        "--matches",
        "iran,oil,war",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: withConfigEnv(configPath),
      },
    );

    expect(stdout).toContain("x:5");
    expect(stdout).not.toContain("x:6");
    expect(stdout).toContain("hits:");
  });
});
