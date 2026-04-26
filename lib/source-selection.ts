import { getEnabledSourceNames } from "./config.ts";
import { listSupportedSources } from "./source-catalog.ts";
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
  supportedSources: Set<FeedSourceName>,
): FeedSourceName[] {
  const requested = explicitSources.filter(Boolean);
  if (requested.length === 0) return [];

  const selectedSources = requested.filter((source): source is FeedSourceName =>
    supportedSources.has(source as FeedSourceName),
  );
  const invalidSources = requested.filter(
    (source) => !supportedSources.has(source as FeedSourceName),
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
  const supportedSources = new Set(listSupportedSources());
  const selectedSources = validateExplicitSources(
    explicitSources,
    supportedSources,
  );
  if (selectedSources.length > 0) return selectedSources;

  const stored = new Set(listStoredSources(saveDir));
  return getEnabledSourceNames(config).filter(
    (source) =>
      supportedSources.has(source as FeedSourceName) && stored.has(source),
  );
}
