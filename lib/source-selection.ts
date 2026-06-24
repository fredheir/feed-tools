import { getEnabledSourceNames } from "./config.ts";
import { SOURCE_NAME_SET } from "./source-metadata.ts";
import type { FeedConfig, FeedSourceName } from "./types.ts";

import { listStoredSources } from "./sqlite-store.ts";

function parseCommaList(spec: string): string[] {
  return String(spec || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function appendCommaList(target: string[], spec: string): string[] {
  return target.concat(parseCommaList(spec));
}

export function validateExplicitSources(
  explicitSources: string[],
): FeedSourceName[] {
  const requested = explicitSources.filter(Boolean);
  if (requested.length === 0) return [];

  const selectedSources = requested.filter((source): source is FeedSourceName =>
    SOURCE_NAME_SET.has(source),
  );
  const invalidSources = requested.filter(
    (source) => !SOURCE_NAME_SET.has(source),
  );

  if (selectedSources.length === 0) {
    throw new Error(
      `No supported sources in explicit selection: ${requested.join(", ")}`,
    );
  }
  if (invalidSources.length > 0) {
    throw new Error(
      `Unsupported source selection: ${invalidSources.join(", ")}`,
    );
  }

  return selectedSources;
}

export function resolveSelectedSources(
  config: FeedConfig,
  saveDir: string,
  explicitSources: string[] = [],
): string[] {
  const selectedSources = validateExplicitSources(explicitSources);
  if (selectedSources.length > 0) return selectedSources;

  const stored = new Set(listStoredSources(saveDir));
  return getEnabledSourceNames(config).filter((source) => stored.has(source));
}
