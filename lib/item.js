"use strict";

/**
 * @typedef {import("./item-shape").FeedItem} FeedItem
 */

/**
 * Return the stable keys used by masking/rendering for one feed item.
 *
 * @param {FeedItem|unknown} item
 * @returns {string[]}
 */
function getItemMaskKeys(item) {
  if (!item || typeof item !== "object") return [];
  const keys = [];
  if (item.id) keys.push(String(item.id));
  if (item.source_item_id) keys.push(String(item.source_item_id));
  if (item.index != null) keys.push(String(item.index));
  if (item.url) keys.push(String(item.url));
  return keys;
}

module.exports = {
  getItemMaskKeys,
};
