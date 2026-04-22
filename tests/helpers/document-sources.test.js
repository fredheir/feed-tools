import { describe, expect, test } from "vitest";
import {
  getDocumentSource,
  getDocumentSources,
} from "../../lib/document-sources.js";

describe("document source helpers", () => {
  test("returns the direct source for non-combined documents", () => {
    expect(getDocumentSource({ source: "x" })).toBe("x");
    expect(getDocumentSources({ source: "x" })).toEqual(["x"]);
  });

  test("deduplicates item sources for combined documents", () => {
    const document = {
      source: "combined",
      items: [
        { source: "linkedin" },
        { source: "x" },
        { source: "linkedin" },
        { source: null },
      ],
    };

    expect(getDocumentSource(document)).toBeNull();
    expect(getDocumentSources(document)).toEqual(["linkedin", "x"]);
  });
});
