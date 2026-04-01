import { describe, expect, test } from "vitest";
import { applyMask } from "../lib/mask.js";

describe("applyMask", () => {
  test("filters by stable item id", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        { id: "x:1", source_item_id: "1", index: 1, url: "a" },
        { id: "x:2", source_item_id: "2", index: 2, url: "b" },
      ],
    };

    const masked = applyMask(doc, { item_ids: ["x:2"] });
    expect(masked.items).toHaveLength(1);
    expect(masked.items[0].id).toBe("x:2");
  });

  test("keeps tab metadata when selecting grouped item ids", () => {
    const doc = {
      schema_version: 1,
      source: "x",
      captured_at: "2026-04-01T00:00:00Z",
      items: [
        { id: "x:1", source_item_id: "1", index: 1, url: "a" },
        { id: "x:2", source_item_id: "2", index: 2, url: "b" },
      ],
    };

    const masked = applyMask(doc, {
      tabs: [
        {
          label: "Coding",
          groups: [{ label: "Coding", item_ids: ["x:2"] }],
        },
      ],
    });

    expect(masked.mask.tabs[0].label).toBe("Coding");
    expect(masked.items).toHaveLength(1);
    expect(masked.items[0].id).toBe("x:2");
  });
});
