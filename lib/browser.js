"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_COMMAND_TIMEOUT_MS = 45000;

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
  return {
    autoConnect:
      (options.autoConnect ?? options.auto_connect) !== false &&
      !(options.cdp ? String(options.cdp) : null),
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
    headed: options.headed === true,
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
    cdp: options.cdp ? String(options.cdp) : null,
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

function runAgentBrowser(commandArgs, options = {}) {
  const { commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, ...browserOptions } =
    options;
  return execFileSync(
    agentBrowserCommand(),
    buildAgentBrowserArgs(browserOptions, commandArgs),
    {
      encoding: "utf8",
      timeout: commandTimeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    },
  ).trim();
}

function sleepMilliseconds(milliseconds) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    Math.max(0, milliseconds),
  );
}

function jitterTimeout(baseMs, spreadMs = 750) {
  const base = Math.max(0, Number(baseMs) || 0);
  const spread = Math.max(0, Number(spreadMs) || 0);
  if (spread === 0) return base;
  return base + Math.floor(Math.random() * (spread + 1));
}

function normalizeUrlPrefixes(urlPrefix) {
  if (Array.isArray(urlPrefix)) {
    return urlPrefix.map((prefix) => String(prefix)).filter(Boolean);
  }
  return [String(urlPrefix)].filter(Boolean);
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

function buildWaitArgs(kind, value, timeoutMs) {
  const args = ["wait"];
  if (kind === "milliseconds") {
    args.push(String(value));
  } else if (kind === "load") {
    args.push("--load", value);
  } else if (kind === "url") {
    args.push("--url", value);
  } else if (kind === "text") {
    args.push("--text", value);
  } else if (kind === "function") {
    args.push("--fn", value);
  } else if (kind === "selector") {
    args.push(value);
  }
  if (Number.isInteger(timeoutMs) && timeoutMs > 0) {
    args.push("--timeout", String(timeoutMs));
  }
  return args;
}

function createBrowserSession(options = {}) {
  const browserOptions = normalizeBrowserOptions(options);

  function run(commandArgs, commandOptions = {}) {
    return runAgentBrowser(commandArgs, {
      ...browserOptions,
      ...commandOptions,
    });
  }

  function getCurrentUrl() {
    return run(["get", "url"]).replace(/\r/g, "");
  }

  function getTitle() {
    return run(["get", "title"]).replace(/\r/g, "");
  }

  function listTabs() {
    const payload = JSON.parse(run(["tab", "list", "--json"]));
    return payload?.data?.tabs || [];
  }

  function switchToTab(index) {
    run(["tab", String(index)]);
  }

  function openNewTab(url) {
    run(["tab", "new", url]);
  }

  function waitMilliseconds(milliseconds) {
    run(buildWaitArgs("milliseconds", milliseconds));
  }

  function waitForLoad(state = "networkidle", timeoutMs = null) {
    run(buildWaitArgs("load", state, timeoutMs));
  }

  function tryWaitForLoad(state = "networkidle", timeoutMs = null) {
    try {
      waitForLoad(state, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  function waitForUrl(urlPattern, timeoutMs = null) {
    run(buildWaitArgs("url", urlPattern, timeoutMs));
  }

  function waitForText(text, timeoutMs = null) {
    run(buildWaitArgs("text", text, timeoutMs));
  }

  function tryWaitForText(text, timeoutMs = null) {
    try {
      waitForText(text, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  function waitForFunction(expression, timeoutMs = null) {
    run(buildWaitArgs("function", expression, timeoutMs));
  }

  function tryWaitForFunction(expression, timeoutMs = null) {
    try {
      waitForFunction(expression, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  function waitForSelector(selector, timeoutMs = null) {
    run(buildWaitArgs("selector", selector, timeoutMs));
  }

  function toBrowserTarget(target) {
    const value = String(target);
    if (value.includes("://")) return value;
    return `file://${path.resolve(value)}`;
  }

  function openPathOrUrl(target) {
    openNewTab(toBrowserTarget(target));
  }

  function reloadCurrentTab() {
    run(["reload"]);
  }

  function ensureTab(urlPrefix, openUrl) {
    const prefixes = normalizeUrlPrefixes(urlPrefix);

    function matchesPrefix(url) {
      return prefixes.some((prefix) => String(url || "").startsWith(prefix));
    }

    function pollCurrentUrl(timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      let currentUrl = "";
      while (Date.now() <= deadline) {
        currentUrl = getCurrentUrl();
        if (matchesPrefix(currentUrl)) return currentUrl;
        sleepMilliseconds(250);
      }
      return currentUrl;
    }

    let currentUrl = getCurrentUrl();
    if (matchesPrefix(currentUrl)) return currentUrl;

    const existingTab = listTabs().find(
      (tab) => typeof tab.url === "string" && matchesPrefix(tab.url),
    );
    if (existingTab) {
      switchToTab(existingTab.index);
      currentUrl = pollCurrentUrl(5000);
      if (matchesPrefix(currentUrl)) return currentUrl;
    }

    openNewTab(openUrl);
    currentUrl = pollCurrentUrl(10000);
    if (!matchesPrefix(currentUrl)) {
      throw new Error(
        `Could not activate tab for ${prefixes.join(", ")}. Current tab: ${currentUrl}`,
      );
    }
    return currentUrl;
  }

  function evalJson(script) {
    const parsed = JSON.parse(run(["eval", script]));
    if (typeof parsed === "string") {
      return JSON.parse(parsed);
    }
    return parsed;
  }

  function evalText(script) {
    return run(["eval", script]);
  }

  function snapshotText(options = ["-c"], timeoutMs = 15000) {
    return run(["snapshot", ...options], { commandTimeoutMs: timeoutMs });
  }

  function getHtml(selector, timeoutMs = 5000) {
    return run(["get", "html", selector], { commandTimeoutMs: timeoutMs });
  }

  return {
    options: browserOptions,
    run,
    getCurrentUrl,
    getTitle,
    listTabs,
    switchToTab,
    openNewTab,
    openPathOrUrl,
    reloadCurrentTab,
    waitMilliseconds,
    waitForLoad,
    tryWaitForLoad,
    waitForUrl,
    waitForText,
    tryWaitForText,
    waitForFunction,
    tryWaitForFunction,
    waitForSelector,
    ensureTab,
    evalJson,
    evalText,
    snapshotText,
    getHtml,
  };
}

const defaultBrowser = createBrowserSession();

module.exports = {
  buildAgentBrowserArgs,
  closeBrowserSession,
  createBrowserSession,
  getRuntimeBrowserOptions,
  jitterTimeout,
  normalizeBrowserOptions,
  ensureTab: defaultBrowser.ensureTab,
  openPathOrUrl: defaultBrowser.openPathOrUrl,
  reloadCurrentTab: defaultBrowser.reloadCurrentTab,
  evalJson: defaultBrowser.evalJson,
  evalText: defaultBrowser.evalText,
  snapshotText: defaultBrowser.snapshotText,
  getHtml: defaultBrowser.getHtml,
};
