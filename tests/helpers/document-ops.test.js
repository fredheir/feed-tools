import { describe, expect, test } from "vitest";
import { combineDocuments } from "../../lib/document-ops.ts";

describe("document ops", () => {
  test("combines documents using the latest capture time and unique item keys", () => {
    const combined = combineDocuments([
      {
        schema_version: 1,
        source: "x",
        captured_at: "2026-04-01T00:00:00Z",
        items: [
          { id: "x:1", source: "x", content: { text: "first" } },
          { id: "x:2", source: "x", content: { text: "second" } },
        ],
      },
      {
        schema_version: 1,
        source: "linkedin",
        captured_at: "2026-04-03T00:00:00Z",
        items: [
          { id: "x:2", source: "x", content: { text: "duplicate" } },
          { id: "linkedin:1", source: "linkedin", content: { text: "third" } },
        ],
      },
    ]);

    expect(combined).toMatchObject({
      schema_version: 1,
      source: "combined",
      captured_at: "2026-04-03T00:00:00Z",
    });
    expect(combined.items.map((item) => item.id)).toEqual([
      "x:1",
      "x:2",
      "linkedin:1",
    ]);
  });

  test("rejects malformed document inputs with explicit errors", () => {
    expect(() => combineDocuments(null)).toThrow(
      "Expected an array of standardized feed documents",
    );
  });
});
