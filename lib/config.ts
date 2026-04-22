import * as fs from "node:fs";
import * as path from "node:path";

import type {
  CurationPreferences,
  FeedBrowserConfig,
  FeedConfig,
  FeedSourceName,
  RawFeedBrowserConfig,
  RawFeedConfig,
  RawSourcePreference,
  SourceCaptureConfig,
  SourcePreference,
} from "./types.js";
import { isSupportedSource } from "./source-catalog.js";

const REPO_ROOT = path.resolve(__dirname, "..");
export const DEFAULT_SAVE_DIR = path.join(REPO_ROOT, "var", "feed-archive");
export const DEFAULT_ASSETS_DIR = path.join(REPO_ROOT, "var", "feed-assets");
const LEGACY_SAVE_DIR = path.join(REPO_ROOT, "var");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => String(entry)).filter(Boolean);
}

function normalizeBrowserConfig(value: unknown): FeedBrowserConfig | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value as RawFeedBrowserConfig;
  return {
    cdp: toOptionalString(raw.cdp),
    autoConnect:
      toOptionalBoolean(raw.autoConnect) ?? toOptionalBoolean(raw.auto_connect),
    headed: toOptionalBoolean(raw.headed),
    args: toStringArray(raw.args ?? raw.browser_args),
    session: toOptionalString(raw.session),
    sessionName: toOptionalString(raw.sessionName ?? raw.session_name),
    profile: toOptionalString(raw.profile),
    statePath: toOptionalString(raw.statePath ?? raw.state_path ?? raw.state),
    allowFileAccess: toOptionalBoolean(
      raw.allowFileAccess ?? raw.allow_file_access,
    ),
    colorScheme: toOptionalString(raw.colorScheme ?? raw.color_scheme),
    executablePath: toOptionalString(raw.executablePath ?? raw.executable_path),
  };
}

function normalizeSourcePreference(
  value: unknown,
  configPath: string,
): SourcePreference | null {
  if (!isRecord(value)) {
    throw new Error(`Invalid source config entry: ${configPath}`);
  }
  const raw = value as RawSourcePreference;
  if (!raw.name || !isSupportedSource(raw.name)) {
    throw new Error(`Unsupported source in config: ${String(raw.name || "")}`);
  }
  const capture = isRecord(raw.capture)
    ? {
        default_limit:
          typeof raw.capture.default_limit === "number"
            ? raw.capture.default_limit
            : undefined,
        assets_dir: toOptionalString(raw.capture.assets_dir) ?? undefined,
        save_dir: toOptionalString(raw.capture.save_dir) ?? undefined,
        browser: normalizeBrowserConfig(raw.capture.browser),
      }
    : undefined;

  return {
    name: raw.name as FeedSourceName,
    enabled: toOptionalBoolean(raw.enabled),
    default: toOptionalBoolean(raw.default),
    capture,
  };
}

function parseConfigPayload(payload: string, configPath: string): FeedConfig {
  const parsed: unknown = JSON.parse(payload);
  if (!isRecord(parsed)) {
    throw new Error(`Invalid config object: ${configPath}`);
  }
  const raw = parsed as RawFeedConfig;
  const sources = Array.isArray(raw.user_preferences?.sources)
    ? raw.user_preferences.sources.map((entry) =>
        normalizeSourcePreference(entry, configPath),
      )
    : [];

  return {
    version: typeof raw.version === "number" ? raw.version : undefined,
    user_preferences: {
      sources: sources.filter((entry): entry is SourcePreference =>
        Boolean(entry),
      ),
      render: isRecord(raw.user_preferences?.render)
        ? {
            show_summary: toOptionalBoolean(
              raw.user_preferences.render.show_summary,
            ),
            show_tabs: toOptionalBoolean(raw.user_preferences.render.show_tabs),
          }
        : undefined,
      curation: isRecord(raw.user_preferences?.curation)
        ? {
            default_mode:
              toOptionalString(raw.user_preferences.curation.default_mode) ??
              undefined,
            preferred_categories: toStringArray(
              raw.user_preferences.curation.preferred_categories,
            ),
            allow_multi_tab_views: toOptionalBoolean(
              raw.user_preferences.curation.allow_multi_tab_views,
            ),
            target_items_per_tab:
              typeof raw.user_preferences.curation.target_items_per_tab ===
              "number"
                ? raw.user_preferences.curation.target_items_per_tab
                : undefined,
            fallback_category:
              toOptionalString(
                raw.user_preferences.curation.fallback_category,
              ) ?? undefined,
            relevance_policy:
              toOptionalString(
                raw.user_preferences.curation.relevance_policy,
              ) ?? undefined,
          }
        : undefined,
      summary: isRecord(raw.user_preferences?.summary)
        ? {
            default_style:
              toOptionalString(raw.user_preferences.summary.default_style) ??
              undefined,
            populate_on_request_only: toOptionalBoolean(
              raw.user_preferences.summary.populate_on_request_only,
            ),
            custom_instructions:
              toOptionalString(
                raw.user_preferences.summary.custom_instructions,
              ) ?? undefined,
            purpose:
              toOptionalString(raw.user_preferences.summary.purpose) ??
              undefined,
            prefer_minimal_agent_writing: toOptionalBoolean(
              raw.user_preferences.summary.prefer_minimal_agent_writing,
            ),
          }
        : undefined,
    },
    summary: isRecord(raw.summary)
      ? {
          notes: toOptionalString(raw.summary.notes) ?? undefined,
        }
      : undefined,
  };
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
