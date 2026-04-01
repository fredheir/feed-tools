import { describe, expect, test } from "vitest";
import { combineDocuments, pruneDocument } from "../lib/document-ops.js";

describe("document ops", () => {
  test("combineDocuments deduplicates using stable synthetic-aware keys", () => {
    const a = {
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "linkedin:synthetic:aaa",
          source: "linkedin",
          url: "https://www.linkedin.com/company/example/posts/",
          content: { text: "first" },
        },
      ],
    };
    const b = {
      captured_at: "2026-04-02T00:00:00Z",
      items: [
        {
          id: "linkedin:synthetic:bbb",
          source: "linkedin",
          url: "https://www.linkedin.com/company/example/posts/",
          content: { text: "second" },
        },
      ],
    };

    const combined = combineDocuments([a, b]);
    expect(combined.captured_at).toBe("2026-04-02T00:00:00Z");
    expect(combined.items).toHaveLength(2);
  });

  test("pruneDocument supports keep and drop semantics", () => {
    const document = {
      items: [{ id: "a" }, { id: "b" }, { id: "c" }],
    };

    expect(pruneDocument(document, { keep: "a,c" }).items).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
    expect(pruneDocument(document, { drop: "b" }).items).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
  });
});
