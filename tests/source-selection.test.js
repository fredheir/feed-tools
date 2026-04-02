import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { persistSourceDocument } from "../lib/sqlite-store.js";
import {
  appendCommaList,
  resolveSelectedSources,
  validateExplicitSources,
} from "../lib/source-selection.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("source selection", () => {
  test("appends comma-separated source lists", () => {
    expect(appendCommaList(["x"], "bluesky, linkedin")).toEqual([
      "x",
      "bluesky",
      "linkedin",
    ]);
  });

  test("prefers explicit supported sources and otherwise falls back to stored enabled sources", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-selection-"));
    tempDirs.push(saveDir);

    for (const source of ["x", "bluesky"]) {
      persistSourceDocument(saveDir, {
        sourceName: source,
        document: {
          schema_version: 1,
          source,
          captured_at: "2026-04-03T10:00:00Z",
          items: [],
        },
      });
    }

    const config = {
      user_preferences: {
        sources: [
          { name: "x", enabled: true },
          { name: "bluesky", enabled: true },
          { name: "linkedin", enabled: true },
        ],
      },
    };

    expect(
      validateExplicitSources(["linkedin"], new Set(["linkedin"])),
    ).toEqual(["linkedin"]);
    expect(resolveSelectedSources(config, saveDir, [])).toEqual([
      "x",
      "bluesky",
    ]);
  });

  test("treats explicit source requests as authoritative", () => {
    expect(() =>
      validateExplicitSources(["invalid"], new Set(["x", "linkedin"])),
    ).toThrow("No supported sources in explicit selection");
    expect(() =>
      validateExplicitSources(
        ["linkedin", "invalid"],
        new Set(["x", "linkedin"]),
      ),
    ).toThrow("Unsupported source selection: invalid");
  });
});
