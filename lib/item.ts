import type { FeedItem } from "./types.js";

export function getItemMaskKeys(item: FeedItem | null | undefined): string[] {
  if (!item) return [];
  const keys: string[] = [];
  if (item.id) keys.push(String(item.id));
  if (item.source_item_id) keys.push(String(item.source_item_id));
  if (item.index != null) keys.push(String(item.index));
  if (item.url) keys.push(String(item.url));
  return keys;
}
