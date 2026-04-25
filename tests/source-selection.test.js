import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { persistSourceDocument } from "../lib/sqlite-store.ts";
import { buildRows, loadDocument } from "../lib/selection.ts";
import {
  appendCommaList,
  resolveSelectedSources,
  validateExplicitSources,
} from "../lib/source-selection.ts";

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

describe("selection document loading", () => {
  test("normalizes mixed document payloads at load time", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "feed-selection-doc-"),
    );
    tempDirs.push(tempDir);
    const inputPath = path.join(tempDir, "feed.json");
    fs.writeFileSync(
      inputPath,
      JSON.stringify({
        source: "linkedin",
        items: [
          {
            source_item_id: "urn:li:activity:1",
            content: {},
            text: "typed at the boundary",
          },
        ],
      }),
    );

    const document = loadDocument(inputPath);

    expect(document).toEqual({
      schema_version: 1,
      source: "linkedin",
      captured_at: null,
      items: [
        {
          id: "linkedin:urn:li:activity:1",
          source: "linkedin",
          source_item_id: "urn:li:activity:1",
          index: 1,
          url: null,
          author: {
            handle: null,
            display_name: null,
            profile_image_url: null,
            profile_image_local: null,
          },
          content: {
            text: "typed at the boundary",
          },
          stats: {
            reply: null,
            share: null,
            like: null,
            view: null,
          },
          media: [],
          cards: [],
          thread: {
            has_thread_line: false,
            thread_line_height: null,
            thread_line_x: null,
            child_candidate_index: null,
            child_candidate_handle: null,
            child_candidate_url: null,
            relationship_confidence: null,
          },
          embedded_links: [],
        },
      ],
    });
    expect(buildRows(document)).toEqual([{ row: 1, item: document.items[0] }]);
  });
});
