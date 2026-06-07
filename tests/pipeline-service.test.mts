import { describe, expect, test } from "vitest";

import { getDefaultDocumentPath } from "../lib/document-paths.ts";
import {
  buildCaptureArgs,
  buildClassifyArgs,
  buildCurateArgs,
  buildRenderArgs,
} from "../lib/pipeline-service.ts";

describe("pipeline service argument builders", () => {
  test("builds capture args", () => {
    expect(
      buildCaptureArgs({
        sources: ["x", "linkedin"],
        limit: 30,
        assetsDir: "./assets",
        saveDir: "./archive",
      }),
    ).toEqual([
      "x",
      "linkedin",
      "30",
      "--assets-dir",
      "./assets",
      "--save-dir",
      "./archive",
    ]);
  });

  test("builds curate args", () => {
    expect(
      buildCurateArgs({
        outputPath: "./var/feed.json",
        sources: ["x"],
        limit: 50,
        excludeCompleted: true,
        matches: ["ukraine", "nato"],
      }),
    ).toEqual([
      "./var/feed.json",
      "--sources",
      "x",
      "--limit",
      "50",
      "--exclude-completed",
      "--matches",
      "ukraine,nato",
    ]);
  });

  test("builds classify args", () => {
    expect(
      buildClassifyArgs({
        inputPath: "./var/feed.json",
        assignments: [
          { category: "Politics", rows: "1-3" },
          { category: "Other", rows: "4" },
        ],
      }),
    ).toEqual([
      "./var/feed.json",
      "--category",
      "Politics:1-3",
      "--category",
      "Other:4",
    ]);
  });

  test("builds render args with no-open by default", () => {
    expect(
      buildRenderArgs({
        inputPath: "./var/feed.json",
        outputPath: "./var/feed.html",
        pick: "1-3,all",
        tab: true,
      }),
    ).toEqual([
      "./var/feed.json",
      "./var/feed.html",
      "--pick",
      "1-3,all",
      "--tab",
      "--no-open",
    ]);
  });

  test("preserves the default input when only output is set", () => {
    expect(buildRenderArgs({ outputPath: "./var/feed.html" })).toEqual([
      getDefaultDocumentPath(),
      "./var/feed.html",
      "--no-open",
    ]);
  });
});
