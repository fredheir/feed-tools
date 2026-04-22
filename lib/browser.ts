"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserSession: createSession } = require("./browser/session");
import type {
  BrowserSession,
  FeedBrowserConfig,
  NormalizedBrowserOptions,
} from "./types.js";

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_COMMAND_TIMEOUT_MS = 45000;
const AGENT_BROWSER_IGNORED_WARNING_PATTERN =
  /^⚠ --args ignored: daemon already running\..*$/gm;

function agentBrowserCommand(): string {
  const localBinary = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agent-browser.cmd" : "agent-browser",
  );
  return fs.existsSync(localBinary) ? localBinary : "agent-browser";
}

function toStringList(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "")).filter(Boolean);
  }
  if (value == null || value === "") return [];
  return [String(value)];
}

function pickOption<T extends keyof FeedBrowserConfig>(
  options: FeedBrowserConfig,
  ...keys: T[]
): FeedBrowserConfig[T] | null {
  for (const key of keys) {
    const value = options[key];
    if (value == null || value === "") continue;
    return value;
  }
  return null;
}

function pickStringOption(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    return String(value);
  }
  return null;
}

function resolveConfigPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const resolved = path.isAbsolute(value)
    ? value
    : path.resolve(REPO_ROOT, value);
  return resolved;
}

export function normalizeBrowserOptions(
  options: FeedBrowserConfig = {},
): NormalizedBrowserOptions {
  const cdp = pickStringOption(options.cdp);
  return {
    autoConnect:
      (options.autoConnect ?? options.auto_connect) !== false && !cdp,
    session: pickStringOption(options.session),
    sessionName: pickStringOption(
      pickOption(options, "sessionName", "session_name") ?? null,
    ),
    profile: resolveConfigPath(pickOption(options, "profile") ?? null),
    statePath: resolveConfigPath(
      pickOption(options, "statePath", "state_path", "state") ?? null,
    ),
    headed: options.headed === true && !cdp,
    allowFileAccess:
      pickOption(options, "allowFileAccess", "allow_file_access") === true,
    colorScheme: pickStringOption(
      pickOption(options, "colorScheme", "color_scheme") ?? null,
    ),
    executablePath: resolveConfigPath(
      pickOption(options, "executablePath", "executable_path") ?? null,
    ),
    cdp,
    args: toStringList(pickOption(options, "args", "browser_args") ?? null),
  };
}

export function getRuntimeBrowserOptions(
  options: FeedBrowserConfig = {},
): NormalizedBrowserOptions {
  const normalized = normalizeBrowserOptions(options);
  const {
    autoConnect,
    session,
    sessionName,
    allowFileAccess,
    colorScheme,
    cdp,
  } = normalized;
  return {
    autoConnect,
    session,
    sessionName,
    profile: null,
    statePath: null,
    headed: false,
    allowFileAccess,
    colorScheme,
    executablePath: null,
    cdp,
    args: [],
  };
}

export function buildAgentBrowserArgs(
  options: FeedBrowserConfig = {},
  commandArgs: string[] = [],
): string[] {
  const normalized = normalizeBrowserOptions(options);
  const args: string[] = [];

  if (normalized.session) args.push("--session", normalized.session);
  if (normalized.sessionName)
    args.push("--session-name", normalized.sessionName);
  if (normalized.profile) args.push("--profile", normalized.profile);
  if (normalized.statePath) args.push("--state", normalized.statePath);
  if (normalized.headed) args.push("--headed");
  if (normalized.allowFileAccess) args.push("--allow-file-access");
  if (normalized.colorScheme)
    args.push("--color-scheme", normalized.colorScheme);
  if (normalized.executablePath)
    args.push("--executable-path", normalized.executablePath);
  if (normalized.cdp) args.push("--cdp", normalized.cdp);
  if (normalized.autoConnect) args.push("--auto-connect");
  if (normalized.args.length > 0)
    args.push("--args", normalized.args.join(","));

  return args.concat(commandArgs);
}

export function sanitizeAgentBrowserOutput(output: unknown): string {
  return String(output || "")
    .replace(AGENT_BROWSER_IGNORED_WARNING_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runAgentBrowser(
  commandArgs: string[],
  options: FeedBrowserConfig & { commandTimeoutMs?: number } = {},
): string {
  const { commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, ...browserOptions } =
    options;
  return sanitizeAgentBrowserOutput(
    execFileSync(
      agentBrowserCommand(),
      buildAgentBrowserArgs(browserOptions, commandArgs),
      {
        encoding: "utf8",
        timeout: commandTimeoutMs,
        maxBuffer: 20 * 1024 * 1024,
      },
    ),
  );
}

export function jitterTimeout(baseMs: number, spreadMs = 750): number {
  const base = Math.max(0, Number(baseMs) || 0);
  const spread = Math.max(0, Number(spreadMs) || 0);
  if (spread === 0) return base;
  return base + Math.floor(Math.random() * (spread + 1));
}

export function closeBrowserSession(options: FeedBrowserConfig = {}): boolean {
  const normalized = normalizeBrowserOptions(options);
  if (!normalized.session) return false;
  try {
    runAgentBrowser(["close"], {
      session: normalized.session,
      autoConnect: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function createBrowserSession(
  options: FeedBrowserConfig = {},
): BrowserSession {
  return createSession(
    {
      normalizeBrowserOptions,
      runAgentBrowser,
    },
    options,
  );
}

module.exports = {
  buildAgentBrowserArgs,
  closeBrowserSession,
  createBrowserSession,
  getRuntimeBrowserOptions,
  jitterTimeout,
  normalizeBrowserOptions,
  sanitizeAgentBrowserOutput,
};
