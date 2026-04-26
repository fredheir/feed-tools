import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  assignCategories,
  groupPickedRowsByCategory,
  loadAllocationFromDocument,
  loadAllocationFromPath,
  mergeAllocations,
  saveAllocationToDocument,
  saveAllocationToPath,
} from "../../lib/allocation.ts";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("allocation helpers", () => {
  test("returns an empty allocation when no file exists", () => {
    const missingPath = path.join(
      os.tmpdir(),
      "does-not-exist",
      "allocation.json",
    );
    expect(loadAllocationFromPath(missingPath)).toEqual({
      version: 1,
      source: null,
      items: {},
    });
  });

  test("saves and reloads allocations through explicit paths", () => {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-allocation-"));
    tempDirs.push(saveDir);
    const allocationPath = path.join(saveDir, "allocation.json");
    const allocation = {
      version: 1,
      source: "x",
      items: {
        "x:1": { category: "Coding" },
      },
    };

    saveAllocationToPath(allocationPath, allocation);

    expect(loadAllocationFromPath(allocationPath)).toEqual(allocation);
    expect(
      loadAllocationFromDocument({ source: "x", items: [] }, allocationPath),
    ).toEqual(allocation);
    expect(
      saveAllocationToDocument(
        { source: "x", items: [] },
        allocation,
        allocationPath,
      ),
    ).toBe(path.resolve(allocationPath));
  });

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
