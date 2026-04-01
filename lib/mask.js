"use strict";

const { getItemMaskKeys } = require("./item");

function collectMaskIdentifiers(mask) {
  if (Array.isArray(mask.item_ids)) return mask.item_ids;
  if (Array.isArray(mask.tabs)) {
    return mask.tabs.flatMap((tab) => {
      if (Array.isArray(tab.item_ids)) return tab.item_ids;
      if (Array.isArray(tab.groups)) {
        return tab.groups.flatMap((group) =>
          Array.isArray(group.item_ids) ? group.item_ids : [],
        );
      }
      return [];
    });
  }
  return [];
}

function applyMask(document, mask) {
  if (!mask) return document;
  if (!Array.isArray(document.items)) {
    throw new Error("Expected standardized feed document with .items array");
  }

  const itemByKey = new Map();
  for (const item of document.items) {
    for (const key of getItemMaskKeys(item)) {
      itemByKey.set(String(key), item);
    }
  }

  const includeIds = collectMaskIdentifiers(mask);
  if (includeIds.length === 0) {
    return { ...document, mask };
  }

  const seen = new Set();
  const items = includeIds
    .map((id) => String(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => itemByKey.get(id))
    .filter(Boolean);

  return {
    ...document,
    items,
    mask,
  };
}

module.exports = {
  applyMask,
};
