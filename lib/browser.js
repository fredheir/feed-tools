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

function pickOption(options, ...keys) {
  for (const key of keys) {
    const value = options[key];
    if (value == null || value === "") continue;
    return value;
  }
  return null;
}

function pickStringOption(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    return String(value);
  }
  return null;
}

function resolveConfigPath(value) {
  if (!value) return null;
  const resolved = path.isAbsolute(value)
    ? value
    : path.resolve(REPO_ROOT, value);
  return resolved;
}

function normalizeBrowserOptions(options = {}) {
  const cdp = pickStringOption(options.cdp);
  return {
    autoConnect:
      (options.autoConnect ?? options.auto_connect) !== false && !cdp,
    session: pickStringOption(options.session),
    sessionName: pickStringOption(
      pickOption(options, "sessionName", "session_name"),
    ),
    profile: resolveConfigPath(pickOption(options, "profile")),
    statePath: resolveConfigPath(
      pickOption(options, "statePath", "state_path", "state"),
    ),
    headed: options.headed === true && !cdp,
    allowFileAccess:
      pickOption(options, "allowFileAccess", "allow_file_access") === true,
    colorScheme: pickStringOption(
      pickOption(options, "colorScheme", "color_scheme"),
    ),
    executablePath: resolveConfigPath(
      pickOption(options, "executablePath", "executable_path"),
    ),
    cdp,
    args: toStringList(pickOption(options, "args", "browser_args")),
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
  jitterTimeout,
  normalizeBrowserOptions,
  sanitizeAgentBrowserOutput,
};
