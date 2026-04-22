import * as fs from "node:fs";
import * as path from "node:path";

import type {
  CurationPreferences,
  FeedBrowserConfig,
  FeedConfig,
  SourceCaptureConfig,
  SourcePreference,
} from "./types.js";

const REPO_ROOT = path.resolve(__dirname, "..");
export const DEFAULT_SAVE_DIR = path.join(REPO_ROOT, "var", "feed-archive");
export const DEFAULT_ASSETS_DIR = path.join(REPO_ROOT, "var", "feed-assets");
const LEGACY_SAVE_DIR = path.join(REPO_ROOT, "var");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseConfigPayload(payload: string, configPath: string): FeedConfig {
  const parsed: unknown = JSON.parse(payload);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid config object: ${configPath}`);
  }
  return parsed as FeedConfig;
}

function getConfigPath(): string {
  const override = process.env.FEED_TOOLS_CONFIG;
  return override
    ? path.resolve(override)
    : path.resolve(__dirname, "..", "config.json");
}

function resolveSaveDir(value: string | null | undefined): string {
  const candidate = String(value || "").trim();
  return candidate ? path.resolve(REPO_ROOT, candidate) : "";
}

export function resolveCanonicalSaveDir(
  config: FeedConfig,
  requestedSaveDir: string | null = null,
  sourceName: string | null = null,
): string {
  const normalizedRequested = resolveSaveDir(requestedSaveDir);

  if (normalizedRequested && normalizedRequested === LEGACY_SAVE_DIR) {
    return getSaveDir(config, sourceName);
  }

  return normalizedRequested || getSaveDir(config, sourceName);
}

function readConfigFile(configPath: string): FeedConfig {
  return parseConfigPayload(fs.readFileSync(configPath, "utf8"), configPath);
}

export function loadConfig(): FeedConfig {
  const configPath = getConfigPath();
  try {
    return readConfigFile(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing config: ${configPath}`);
    }
    throw error;
  }
}

export function loadOptionalConfig(): FeedConfig | null {
  const configPath = getConfigPath();
  try {
    return readConfigFile(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function getSources(config: FeedConfig): SourcePreference[] {
  return config?.user_preferences?.sources || [];
}

function getEnabledSources(config: FeedConfig): SourcePreference[] {
  return getSources(config).filter((source) => source?.enabled !== false);
}

export function getEnabledSourceNames(config: FeedConfig): string[] {
  return getEnabledSources(config)
    .map((source) => source?.name)
    .filter((value): value is string => Boolean(value));
}

function getSourcePreferences(
  config: FeedConfig,
  sourceName: string,
): SourcePreference | null {
  return (
    getSources(config).find((source) => source.name === sourceName) || null
  );
}

export function getDefaultSource(config: FeedConfig): string | null {
  const sources = getEnabledSources(config);
  return (
    sources.find((source) => source.default)?.name || sources[0]?.name || null
  );
}

export function getCaptureDefaults(
  config: FeedConfig,
  sourceName: string,
): SourceCaptureConfig {
  const source = getSourcePreferences(config, sourceName);
  return source?.capture || {};
}

export function getCaptureBrowserOptions(
  config: FeedConfig,
  sourceName: string,
): FeedBrowserConfig {
  return getCaptureDefaults(config, sourceName).browser || {};
}

export function getSaveDir(
  config: FeedConfig,
  sourceName: string | null = null,
): string {
  if (sourceName) {
    return resolveSaveDir(
      getCaptureDefaults(config, sourceName).save_dir || DEFAULT_SAVE_DIR,
    );
  }

  return resolveSaveDir(
    getEnabledSources(config)[0]?.capture?.save_dir ||
      getSources(config)[0]?.capture?.save_dir ||
      DEFAULT_SAVE_DIR,
  );
}

export function getCurationPreferences(
  config: FeedConfig,
): CurationPreferences {
  return config?.user_preferences?.curation || {};
}
