import * as fs from "node:fs";
import * as path from "node:path";

import type {
  CurationPreferences,
  FeedBrowserConfig,
  FeedConfig,
  FeedSourceName,
  RawFeedConfig,
  RawSourcePreference,
  RenderPreferences,
  SummaryPreferences,
  SourceCaptureConfig,
  SourcePreference,
  UserPreferences,
} from "./types.ts";
import {
  isRecord,
  toOptionalBoolean,
  toOptionalString,
  toStringArray,
} from "./coerce.ts";
import { isSupportedSource } from "./source-catalog.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
export const DEFAULT_SAVE_DIR = path.join(REPO_ROOT, "var", "feed-archive");
export const DEFAULT_ASSETS_DIR = path.join(REPO_ROOT, "var", "feed-assets");
const LEGACY_SAVE_DIR = path.join(REPO_ROOT, "var");
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, "config.json.example");

function normalizeBrowserConfig(value: unknown): FeedBrowserConfig {
  if (!isRecord(value)) return {};
  const raw = value as Partial<FeedBrowserConfig>;
  return {
    cdp: toOptionalString(raw.cdp),
    autoConnect: toOptionalBoolean(raw.autoConnect),
    headed: toOptionalBoolean(raw.headed),
    args: toStringArray(raw.args),
    session: toOptionalString(raw.session),
    sessionName: toOptionalString(raw.sessionName),
    profile: toOptionalString(raw.profile),
    statePath: toOptionalString(raw.statePath),
    allowFileAccess: toOptionalBoolean(raw.allowFileAccess),
    colorScheme: toOptionalString(raw.colorScheme),
    executablePath: toOptionalString(raw.executablePath),
  };
}

function normalizeCaptureConfig(
  value: unknown,
): SourceCaptureConfig | undefined {
  if (!isRecord(value)) return undefined;
  return {
    default_limit:
      typeof value.default_limit === "number" ? value.default_limit : undefined,
    assets_dir: toOptionalString(value.assets_dir) ?? undefined,
    save_dir: toOptionalString(value.save_dir) ?? undefined,
    browser: normalizeBrowserConfig(value.browser),
  };
}

function normalizeSourcePreference(
  value: unknown,
  configPath: string,
): SourcePreference {
  if (!isRecord(value)) {
    throw new Error(`Invalid source config entry: ${configPath}`);
  }
  const raw = value as RawSourcePreference;
  if (!raw.name || !isSupportedSource(raw.name)) {
    throw new Error(`Unsupported source in config: ${String(raw.name || "")}`);
  }

  return {
    name: raw.name as FeedSourceName,
    enabled: toOptionalBoolean(raw.enabled),
    default: toOptionalBoolean(raw.default),
    capture: normalizeCaptureConfig(raw.capture),
  };
}

function normalizeRenderPreferences(value: unknown): RenderPreferences {
  if (!isRecord(value)) return {};
  return {
    show_summary: toOptionalBoolean(value.show_summary),
    show_tabs: toOptionalBoolean(value.show_tabs),
  };
}

function normalizeCurationPreferences(value: unknown): CurationPreferences {
  if (!isRecord(value)) return {};
  return {
    default_mode: toOptionalString(value.default_mode) ?? undefined,
    preferred_categories: toStringArray(value.preferred_categories),
    allow_multi_tab_views: toOptionalBoolean(value.allow_multi_tab_views),
    target_items_per_tab:
      typeof value.target_items_per_tab === "number"
        ? value.target_items_per_tab
        : undefined,
    fallback_category: toOptionalString(value.fallback_category) ?? undefined,
    relevance_policy: toOptionalString(value.relevance_policy) ?? undefined,
  };
}

function normalizeSummaryPreferences(value: unknown): SummaryPreferences {
  if (!isRecord(value)) return {};
  return {
    default_style: toOptionalString(value.default_style) ?? undefined,
    populate_on_request_only: toOptionalBoolean(value.populate_on_request_only),
    custom_instructions:
      toOptionalString(value.custom_instructions) ?? undefined,
    purpose: toOptionalString(value.purpose) ?? undefined,
    prefer_minimal_agent_writing: toOptionalBoolean(
      value.prefer_minimal_agent_writing,
    ),
  };
}

function normalizeUserPreferences(
  value: unknown,
  configPath: string,
): UserPreferences {
  if (!isRecord(value)) {
    return {
      sources: [],
      render: {},
      curation: {},
      summary: {},
    };
  }
  const sources = Array.isArray(value.sources)
    ? value.sources.map((entry) => normalizeSourcePreference(entry, configPath))
    : [];
  return {
    sources,
    render: normalizeRenderPreferences(value.render),
    curation: normalizeCurationPreferences(value.curation),
    summary: normalizeSummaryPreferences(value.summary),
  };
}

export function parseConfigPayload(
  payload: string,
  configPath: string,
): FeedConfig {
  const parsed: unknown = JSON.parse(payload);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid config object: ${configPath}`);
  }
  const raw = parsed as RawFeedConfig;

  return {
    version: typeof raw.version === "number" ? raw.version : undefined,
    user_preferences: normalizeUserPreferences(
      raw.user_preferences,
      configPath,
    ),
    summary: isRecord(raw.summary)
      ? { notes: toOptionalString(raw.summary.notes) ?? undefined }
      : {},
  };
}

function getConfigPath(): string {
  const override = process.env.FEED_TOOLS_CONFIG;
  return override ? path.resolve(override) : DEFAULT_CONFIG_PATH;
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
      if (
        !process.env.FEED_TOOLS_CONFIG &&
        fs.existsSync(EXAMPLE_CONFIG_PATH)
      ) {
        process.stderr.write(
          `Warning: ${configPath} not found; using ${EXAMPLE_CONFIG_PATH}. Copy it to config.json and tailor sources, render, curation, and summary preferences before live capture.\n`,
        );
        return readConfigFile(EXAMPLE_CONFIG_PATH);
      }
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (
        !process.env.FEED_TOOLS_CONFIG &&
        fs.existsSync(EXAMPLE_CONFIG_PATH)
      ) {
        return readConfigFile(EXAMPLE_CONFIG_PATH);
      }
      return null;
    }
    throw error;
  }
}

function getSources(config: FeedConfig): SourcePreference[] {
  return config.user_preferences.sources;
}

function getEnabledSources(config: FeedConfig): SourcePreference[] {
  return getSources(config).filter((source) => source?.enabled !== false);
}

export function getEnabledSourceNames(config: FeedConfig): string[] {
  return getEnabledSources(config)
    .map((source) => source?.name)
    .filter((value): value is FeedSourceName => Boolean(value));
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
  return source?.capture || { browser: {} };
}

export function getCaptureBrowserOptions(
  config: FeedConfig,
  sourceName: string,
): FeedBrowserConfig {
  return getCaptureDefaults(config, sourceName).browser;
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
  return config.user_preferences.curation;
}
