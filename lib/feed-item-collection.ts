import { getPreferredItemKey } from "./item-shape.ts";

function collectUniqueItems<T extends { index?: number | null }>(
  items: unknown[],
  {
    seen,
    sourceName,
    target = [],
    mapItem = (item: unknown) => item as T | null,
    shouldInclude = () => true,
  }: {
    seen: Set<string>;
    sourceName: string;
    target?: T[];
    mapItem?: (item: unknown) => T | null;
    shouldInclude?: (item: T) => boolean;
  },
): T[] {
  for (const rawItem of items || []) {
    const item = mapItem(rawItem);
    if (!item || !shouldInclude(item)) continue;
    const key = getPreferredItemKey(item, {
      source: sourceName,
      index: item.index,
    });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
  return target;
}

export { collectUniqueItems };
