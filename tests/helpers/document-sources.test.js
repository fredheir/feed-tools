import { describe, expect, test } from "vitest";
import { getDocumentSources } from "../../lib/document-sources.ts";

describe("document source helpers", () => {
  test("returns the direct source for non-combined documents", () => {
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

    expect(getDocumentSources(document)).toEqual(["linkedin", "x"]);
  });
});
