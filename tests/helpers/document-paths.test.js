import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  getDefaultDocumentPath,
  getDefaultHtmlPath,
  getDefaultMaskPath,
} from "../../lib/document-paths.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("document paths", () => {
  test("returns repo-local default document and html paths", () => {
    expect(getDefaultDocumentPath()).toBe(
      path.join(repoRoot, "var", "feed.json"),
    );
    expect(getDefaultHtmlPath()).toBe(path.join(repoRoot, "var", "feed.html"));
  });

  test("derives mask paths from json and non-json inputs", () => {
    expect(getDefaultMaskPath("./var/topic.json")).toBe(
      path.join(repoRoot, "var", "topic.mask.json"),
    );
    expect(getDefaultMaskPath("./var/topic")).toBe(
      path.join(repoRoot, "var", "topic.mask.json"),
    );
  });
});
