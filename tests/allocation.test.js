import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  assignCategories,
  groupPickedRowsByCategory,
  loadAllocation,
  mergeAllocations,
  saveAllocation,
} from "../lib/allocation.js";

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("allocation helpers", () => {
  test("assigns categories from row selections", () => {
    const document = {
      source: "x",
      items: [
        { id: "x:a", author: { handle: "@a" }, content: { text: "A" } },
        { id: "x:b", author: { handle: "@b" }, content: { text: "B" } },
      ],
    };

    const allocation = assignCategories(document, null, [
      { category: "Coding", selection: "2" },
      { category: "Politics", selection: "x:a" },
    ]);

    expect(allocation.items["x:a"].category).toBe("Politics");
    expect(allocation.items["x:b"].category).toBe("Coding");
  });

  test("groups picked rows by stored category", () => {
    const document = {
      source: "x",
      items: [
        { id: "x:a", author: { handle: "@a" }, content: { text: "A" } },
        { id: "x:b", author: { handle: "@b" }, content: { text: "B" } },
        { id: "x:c", author: { handle: "@c" }, content: { text: "C" } },
      ],
    };
    const allocation = {
      items: {
        "x:a": { category: "Politics" },
        "x:b": { category: "Coding" },
      },
    };

    const tabs = groupPickedRowsByCategory(document, allocation, "2,1,3", {
      fallbackCategory: "Other",
      preferredCategories: ["Coding", "Politics", "Finance"],
    });

    expect(tabs).toEqual([
      { label: "Coding", groups: [{ label: "Coding", item_ids: ["x:b"] }] },
      {
        label: "Politics",
        groups: [{ label: "Politics", item_ids: ["x:a"] }],
      },
      { label: "Other", groups: [{ label: "Other", item_ids: ["x:c"] }] },
    ]);
  });

  test("persists allocation files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-allocation-test-"));
    tempDirs.push(dir);
    const allocationPath = path.join(dir, "allocation.json");
    const allocation = {
      version: 1,
      source: "x",
      items: { "x:a": { category: "Coding" } },
    };

    saveAllocation(allocationPath, allocation);
    expect(loadAllocation(allocationPath)).toEqual(allocation);
  });

  test("merges per-source allocations for combined documents", () => {
    const document = {
      source: "combined",
      items: [
        { id: "facebook:a", source: "facebook" },
        { id: "x:b", source: "x" },
        { id: "linkedin:c", source: "linkedin" },
      ],
    };

    const allocation = mergeAllocations(document, [
      { items: { "facebook:a": { category: "Friends and Family" } } },
      { items: { "x:b": { category: "Coding" } } },
    ]);

    expect(allocation).toEqual({
      version: 1,
      source: "combined",
      items: {
        "facebook:a": { category: "Friends and Family" },
        "x:b": { category: "Coding" },
      },
    });
  });

  test("mergeAllocations ignores entries for items not present in the document", () => {
    const document = {
      source: "combined",
      items: [{ id: "x:a", source: "x" }],
    };

    const allocation = mergeAllocations(document, [
      {
        items: {
          "x:a": { category: "Coding" },
          "x:b": { category: "Politics" },
        },
      },
    ]);

    expect(allocation.items).toEqual({
      "x:a": { category: "Coding" },
    });
  });
});
