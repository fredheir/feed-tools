"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserSession: createSession } = require("./browser/session");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_COMMAND_TIMEOUT_MS = 45000;
const AGENT_BROWSER_IGNORED_WARNING_PATTERN =
  /^⚠ --args ignored: daemon already running\..*$/gm;

function agentBrowserCommand() {
  const localBinary = path.resolve(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agent-browser.cmd" : "agent-browser",
  );
  return fs.existsSync(localBinary) ? localBinary : "agent-browser";
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "")).filter(Boolean);
  }
  if (value == null || value === "") return [];
  return [String(value)];
}

function resolveConfigPath(value) {
  if (!value) return null;
  const resolved = path.isAbsolute(value)
    ? value
    : path.resolve(REPO_ROOT, value);
  return resolved;
}

function normalizeBrowserOptions(options = {}) {
  const cdp = options.cdp ? String(options.cdp) : null;
  return {
    autoConnect:
      (options.autoConnect ?? options.auto_connect) !== false && !cdp,
    session: options.session ? String(options.session) : null,
    sessionName: options.sessionName
      ? String(options.sessionName)
      : options.session_name
        ? String(options.session_name)
        : null,
    profile: resolveConfigPath(options.profile),
    statePath: resolveConfigPath(
      options.statePath || options.state_path || options.state,
    ),
    headed: options.headed === true && !cdp,
    allowFileAccess:
      options.allowFileAccess === true || options.allow_file_access === true,
    colorScheme: options.colorScheme
      ? String(options.colorScheme)
      : options.color_scheme
        ? String(options.color_scheme)
        : null,
    executablePath: resolveConfigPath(
      options.executablePath || options.executable_path,
    ),
    cdp,
    args: toStringList(options.args || options.browser_args),
  };
}

function getRuntimeBrowserOptions(options = {}) {
  const normalized = normalizeBrowserOptions(options);
  return {
    autoConnect: normalized.autoConnect,
    session: normalized.session,
    sessionName: normalized.sessionName,
    profile: null,
    statePath: null,
    headed: false,
    allowFileAccess: normalized.allowFileAccess,
    colorScheme: normalized.colorScheme,
    executablePath: null,
    cdp: normalized.cdp,
    args: [],
  };
}

function buildAgentBrowserArgs(options = {}, commandArgs = []) {
  const normalized = normalizeBrowserOptions(options);
  const args = [];

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

function sanitizeAgentBrowserOutput(output) {
  return String(output || "")
    .replace(AGENT_BROWSER_IGNORED_WARNING_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runAgentBrowser(commandArgs, options = {}) {
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

function jitterTimeout(baseMs, spreadMs = 750) {
  const base = Math.max(0, Number(baseMs) || 0);
  const spread = Math.max(0, Number(spreadMs) || 0);
  if (spread === 0) return base;
  return base + Math.floor(Math.random() * (spread + 1));
}

function closeBrowserSession(options = {}) {
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

function createBrowserSession(options = {}) {
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
