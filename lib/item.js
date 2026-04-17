"use strict";

/**
 * @typedef {import("./item-shape").FeedItemInput} FeedItemInput
 */

/**
 * Return the stable keys used by masking/rendering for one feed item.
 *
 * @param {FeedItemInput|null|undefined} item
 * @returns {string[]}
 */
function getItemMaskKeys(item) {
  if (item == null) return [];
  const { id, source_item_id, index, url } = item;
  const keys = [];
  if (id) keys.push(String(id));
  if (source_item_id) keys.push(String(source_item_id));
  if (index != null) keys.push(String(index));
  if (url) keys.push(String(url));
  return keys;
}

module.exports = {
  getItemMaskKeys,
};
