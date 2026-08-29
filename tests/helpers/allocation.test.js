import { describe, expect, test } from "vitest";
import {
  assignCategories,
  groupPickedRowsByCategory,
  mergeAllocations,
} from "../../lib/allocation.ts";

describe("allocation helpers", () => {
  test("merges and assigns only rows present in the document", () => {
    const document = {
      schema_version: 1,
      source: "combined",
      items: [
        {
          id: "x:1",
          source: "x",
          author: { handle: "@x" },
          content: { text: "one" },
        },
        {
          id: "linkedin:1",
          source: "linkedin",
          author: { handle: "li" },
          content: { text: "two" },
        },
      ],
    };

    expect(
      mergeAllocations(document, [
        {
          items: {
            "x:1": { category: "Coding" },
            "missing:1": { category: "Ignore" },
          },
        },
        {
          items: {
            "linkedin:1": { category: "News" },
          },
        },
      ]),
    ).toEqual({
      version: 1,
      source: "combined",
      items: {
        "x:1": { category: "Coding" },
        "linkedin:1": { category: "News" },
      },
    });

    const assigned = assignCategories(document, { items: {} }, [
      { category: "ADs", selection: "2" },
      { category: "Coding", selection: "x:1" },
    ]);

    expect(assigned.items["x:1"]).toMatchObject({ category: "Coding" });
    expect(assigned.items["linkedin:1"]).toMatchObject({ category: "ADs" });
    expect(assigned.items["x:1"].updated_at).toEqual(expect.any(String));
  });

  test("rejects invalid documents in helper entry points", () => {
    expect(() => assignCategories(null, { items: {} }, [])).toThrow(
      "Expected standardized feed document with .items array in assignCategories",
    );
  });

  test("groups picked rows by category with preferred ordering", () => {
    const document = {
      schema_version: 1,
      source: "combined",
      items: [
        {
          id: "x:1",
          source: "x",
          author: { handle: "@x" },
          content: { text: "one" },
        },
        {
          id: "linkedin:1",
          source: "linkedin",
          author: { handle: "li" },
          content: { text: "two" },
        },
      ],
    };
    const allocation = {
      items: {
        "x:1": { category: "Coding" },
        "linkedin:1": { category: "ADs" },
      },
    };

    expect(
      groupPickedRowsByCategory(document, allocation, "1,2", {
        preferredCategories: ["ADs"],
      }),
    ).toEqual([
      {
        label: "ADs",
        groups: [{ label: "ADs", item_ids: ["linkedin:1"] }],
      },
      {
        label: "Coding",
        groups: [{ label: "Coding", item_ids: ["x:1"] }],
      },
    ]);

    expect(
      groupPickedRowsByCategory(document, allocation, ["1", "2"], {
        preferredCategories: ["ADs"],
      }),
    ).toEqual([
      {
        label: "ADs",
        groups: [{ label: "ADs", item_ids: ["linkedin:1"] }],
      },
      {
        label: "Coding",
        groups: [{ label: "Coding", item_ids: ["x:1"] }],
      },
    ]);
  });
});
