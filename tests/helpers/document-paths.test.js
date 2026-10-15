import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  getDefaultDocumentPath,
  getDefaultHtmlPath,
} from "../../lib/document-paths.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("document paths", () => {
  test("returns repo-local default document and html paths", () => {
    expect(getDefaultDocumentPath()).toBe(
      path.join(repoRoot, "var", "feed.json"),
    );
    expect(getDefaultHtmlPath()).toBe(path.join(repoRoot, "var", "feed.html"));
  });
});
