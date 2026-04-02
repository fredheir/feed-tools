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

  test("combineDocuments aligns fallback items by canonical url before synthetic id", () => {
    const a = {
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        {
          id: "facebook:synthetic:aaa",
          source: "facebook",
          url: "https://www.facebook.com/alex/posts/pfbid123/?__tn__=-R",
          content: { text: "first" },
        },
      ],
    };
    const b = {
      captured_at: "2026-04-02T00:00:00Z",
      items: [
        {
          id: "facebook:synthetic:bbb",
          source: "facebook",
          url: "https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Falex%2Fposts%2Fpfbid123&show_text=true",
          content: { text: "second" },
        },
      ],
    };

    const combined = combineDocuments([a, b]);
    expect(combined.items).toHaveLength(1);
    expect(combined.items[0].content.text).toBe("first");
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
