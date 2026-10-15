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
import { parseCaptureLimit } from "./capture-limit.ts";
import { SOURCE_NAME_SET } from "./source-metadata.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
export const DEFAULT_SAVE_DIR = path.join(REPO_ROOT, "var", "feed-archive");
const LEGACY_SAVE_DIR = path.join(REPO_ROOT, "var");
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, "config.json.example");
const CONFIG_BASE_DIR = new WeakMap<FeedConfig, string>();

export function defaultConfigPath(
  workdir = process.env.FEED_TOOLS_WORKDIR || REPO_ROOT,
): string {
  return path.join(path.resolve(workdir), "config.json");
}

export function resolveConfigPath(
  configPath: string | null | undefined,
): string {
  return path.resolve(
    configPath || process.env.FEED_TOOLS_CONFIG || defaultConfigPath(),
  );
}

export function findConfigTemplatePath(
  targetPath: string,
  workdir = process.env.FEED_TOOLS_WORKDIR || REPO_ROOT,
): string | null {
  const resolvedTargetPath = path.resolve(targetPath);
  const candidates = [
    path.join(path.dirname(resolvedTargetPath), "config.json.example"),
    path.join(path.resolve(workdir), "config.json.example"),
    EXAMPLE_CONFIG_PATH,
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function defaultConfigTemplatePath(
  targetPath: string,
  workdir = process.env.FEED_TOOLS_WORKDIR || REPO_ROOT,
): string {
  return (
    findConfigTemplatePath(targetPath, workdir) ??
    path.join(path.resolve(workdir), "config.json.example")
  );
}

export interface ConfigWriteOptions {
  targetPath: string;
  templatePath: string;
  overwrite?: boolean;
  useExistingTargetAsTemplate?: boolean;
  sources?: unknown;
  browser?: unknown;
  render?: unknown;
  curation?: unknown;
  summary?: unknown;
}

export interface ConfigWriteResult {
  ok: true;
  written: boolean;
  path: string;
  detail?: string;
  sourcesEnabled?: string[];
  preferenceSectionsWritten?: number;
  browser?: Record<string, unknown>;
}

export interface ConfigReadResult {
  ok: true;
  path: string;
  exists: boolean;
  config: unknown | null;
}

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
      value.default_limit === undefined
        ? undefined
        : parseCaptureLimit(value.default_limit, "default_limit"),
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
  if (!raw.name || !SOURCE_NAME_SET.has(raw.name)) {
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

function enabledSourceNames(sources: unknown[]): string[] {
  const names: string[] = [];
  for (const source of sources) {
    if (!isRecord(source) || source.enabled === false) continue;
    const name = toOptionalString(source.name);
    if (name) names.push(name);
  }
  return names;
}

function mergePreferenceSection(
  userPreferences: Record<string, unknown>,
  key: "render" | "curation" | "summary",
  value: unknown,
): boolean {
  if (!isRecord(value)) return false;
  const existing = isRecord(userPreferences[key]) ? userPreferences[key] : {};
  userPreferences[key] = { ...existing, ...value };
  return true;
}

export function writeConfigFromPreferences({
  targetPath,
  templatePath,
  overwrite = false,
  useExistingTargetAsTemplate = true,
  sources: sourceInput,
  browser: browserInput,
  render,
  curation,
  summary,
}: ConfigWriteOptions): ConfigWriteResult {
  const resolvedTargetPath = path.resolve(targetPath);
  if (fs.existsSync(resolvedTargetPath) && !overwrite) {
    return {
      ok: true,
      written: false,
      path: resolvedTargetPath,
      detail: "config already exists; pass overwrite=true to replace it",
    };
  }

  const resolvedTemplatePath =
    useExistingTargetAsTemplate &&
    fs.existsSync(resolvedTargetPath) &&
    overwrite
      ? resolvedTargetPath
      : path.resolve(templatePath);
  if (!fs.existsSync(resolvedTemplatePath)) {
    throw new Error(`Missing config template: ${resolvedTemplatePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolvedTemplatePath, "utf8"));
  if (!isRecord(raw)) throw new Error("Invalid config template");
  const config = raw;
  const userPreferences = isRecord(config.user_preferences)
    ? config.user_preferences
    : {};
  config.user_preferences = userPreferences;
  const sources = Array.isArray(userPreferences.sources)
    ? userPreferences.sources
    : [];
  userPreferences.sources = sources;

  const sourceSpecs = Array.isArray(sourceInput) ? sourceInput : [];
  const sourceSpecByName = new Map<string, Record<string, unknown>>();
  for (const spec of sourceSpecs) {
    if (!isRecord(spec)) continue;
    const name = toOptionalString(spec.name);
    if (name) sourceSpecByName.set(name, spec);
  }
  const requestedSources = new Set(sourceSpecByName.keys());
  const browser = isRecord(browserInput) ? browserInput : null;
  const preferenceSectionsWritten = [
    mergePreferenceSection(userPreferences, "render", render),
    mergePreferenceSection(userPreferences, "curation", curation),
    mergePreferenceSection(userPreferences, "summary", summary),
  ].filter(Boolean).length;

  for (const source of sources) {
    if (!isRecord(source)) continue;
    const name = toOptionalString(source.name);
    if (!name) continue;
    const spec = sourceSpecByName.get(name);
    if (requestedSources.size > 0) source.enabled = requestedSources.has(name);
    if (spec) {
      if (typeof spec.enabled === "boolean") source.enabled = spec.enabled;
      if (typeof spec.default === "boolean") source.default = spec.default;
    }
    const capture = isRecord(source.capture) ? source.capture : {};
    source.capture = capture;
    if (spec && spec.default_limit !== undefined) {
      capture.default_limit = parseCaptureLimit(
        spec.default_limit,
        "default_limit",
      );
    }
    if (browser) capture.browser = { ...browser };
  }

  fs.mkdirSync(path.dirname(resolvedTargetPath), { recursive: true });
  fs.writeFileSync(
    resolvedTargetPath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  return {
    ok: true,
    written: true,
    path: resolvedTargetPath,
    sourcesEnabled: enabledSourceNames(sources),
    preferenceSectionsWritten,
    browser: browser ? { ...browser } : {},
  };
}

export function readConfigDocument(targetPath: string): ConfigReadResult {
  const resolvedTargetPath = path.resolve(targetPath);
  if (!fs.existsSync(resolvedTargetPath)) {
    return {
      ok: true,
      path: resolvedTargetPath,
      exists: false,
      config: null,
    };
  }

  return {
    ok: true,
    path: resolvedTargetPath,
    exists: true,
    config: JSON.parse(fs.readFileSync(resolvedTargetPath, "utf8")),
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

  const config: FeedConfig = {
    version: typeof raw.version === "number" ? raw.version : undefined,
    user_preferences: normalizeUserPreferences(
      raw.user_preferences,
      configPath,
    ),
    summary: isRecord(raw.summary)
      ? { notes: toOptionalString(raw.summary.notes) ?? undefined }
      : {},
  };
  CONFIG_BASE_DIR.set(config, path.dirname(path.resolve(configPath)));
  return config;
}

function getConfigPath(): string {
  return resolveConfigPath(null);
}

function configBaseDir(config: FeedConfig): string {
  return CONFIG_BASE_DIR.get(config) ?? REPO_ROOT;
}

function defaultSaveDir(config: FeedConfig): string {
  return path.join(configBaseDir(config), "var", "feed-archive");
}

function defaultAssetsDir(config: FeedConfig): string {
  return path.join(configBaseDir(config), "var", "feed-assets");
}

function resolveConfigRelativePath(
  value: string | null | undefined,
  config: FeedConfig,
): string {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  return path.isAbsolute(candidate)
    ? candidate
    : path.resolve(configBaseDir(config), candidate);
}

function resolveConfigRelativeBrowserPaths(
  browser: FeedBrowserConfig,
  config: FeedConfig,
): FeedBrowserConfig {
  return {
    ...browser,
    profile:
      browser.profile === null
        ? null
        : resolveConfigRelativePath(browser.profile, config) || browser.profile,
    statePath:
      browser.statePath === null
        ? null
        : resolveConfigRelativePath(browser.statePath, config) ||
          browser.statePath,
    executablePath:
      browser.executablePath === null
        ? null
        : resolveConfigRelativePath(browser.executablePath, config) ||
          browser.executablePath,
  };
}

export function resolveCanonicalSaveDir(
  config: FeedConfig,
  requestedSaveDir: string | null = null,
  sourceName: string | null = null,
): string {
  const normalizedRequested = resolveConfigRelativePath(
    requestedSaveDir,
    config,
  );
  const legacySaveDir = path.join(configBaseDir(config), "var");

  if (
    normalizedRequested &&
    (normalizedRequested === LEGACY_SAVE_DIR ||
      normalizedRequested === legacySaveDir)
  ) {
    return getSaveDir(config, sourceName);
  }

  return normalizedRequested || getSaveDir(config, sourceName);
}

function readConfigFile(configPath: string): FeedConfig {
  return parseConfigPayload(fs.readFileSync(configPath, "utf8"), configPath);
}

function fallbackConfigTemplatePath(configPath: string): string | null {
  return process.env.FEED_TOOLS_CONFIG
    ? null
    : findConfigTemplatePath(configPath);
}

export function loadConfig(): FeedConfig {
  const configPath = getConfigPath();
  try {
    return readConfigFile(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const templatePath = fallbackConfigTemplatePath(configPath);
      if (templatePath) {
        process.stderr.write(
          `Warning: ${configPath} not found; using ${templatePath}. Copy it to config.json and tailor sources, render, curation, and summary preferences before live capture.\n`,
        );
        return readConfigFile(templatePath);
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
      const templatePath = fallbackConfigTemplatePath(configPath);
      if (templatePath) return readConfigFile(templatePath);
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

export function getEnabledSourceNames(config: FeedConfig): FeedSourceName[] {
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

export function getCaptureDefaults(
  config: FeedConfig,
  sourceName: string,
): SourceCaptureConfig {
  const source = getSourcePreferences(config, sourceName);
  const capture = source?.capture || { browser: {} };
  const browser = capture.browser
    ? resolveConfigRelativeBrowserPaths(capture.browser, config)
    : capture.browser;
  return {
    ...capture,
    browser,
    assets_dir: capture.assets_dir
      ? resolveConfigRelativePath(capture.assets_dir, config)
      : undefined,
    save_dir: capture.save_dir
      ? resolveConfigRelativePath(capture.save_dir, config)
      : undefined,
  };
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
    return resolveConfigRelativePath(
      getCaptureDefaults(config, sourceName).save_dir || defaultSaveDir(config),
      config,
    );
  }

  return resolveConfigRelativePath(
    getEnabledSources(config)[0]?.capture?.save_dir ||
      getSources(config)[0]?.capture?.save_dir ||
      defaultSaveDir(config),
    config,
  );
}

export function getAssetsDir(
  config: FeedConfig,
  sourceName: string | null = null,
): string {
  if (sourceName) {
    return (
      getCaptureDefaults(config, sourceName).assets_dir ||
      defaultAssetsDir(config)
    );
  }

  const configuredAssetsDir =
    getEnabledSources(config)[0]?.capture?.assets_dir ||
    getSources(config)[0]?.capture?.assets_dir;
  return configuredAssetsDir
    ? resolveConfigRelativePath(configuredAssetsDir, config)
    : defaultAssetsDir(config);
}

export function getCurationPreferences(
  config: FeedConfig,
): CurationPreferences {
  return config.user_preferences.curation;
}
