"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function sleepMilliseconds(milliseconds) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    Math.max(0, milliseconds),
  );
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

function normalizeUrlPrefixes(urlPrefix) {
  if (Array.isArray(urlPrefix)) {
    return urlPrefix.map((prefix) => String(prefix)).filter(Boolean);
  }
  return [String(urlPrefix)].filter(Boolean);
}

function getMountInfo(targetPath) {
  const payload = execFileSync(
    "findmnt",
    ["-J", "-T", targetPath, "--output", "TARGET,SOURCE"],
    {
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(payload);
  return parsed?.filesystems?.[0] || null;
}

function translateMountedPath(resolvedPath, mount) {
  const mountTarget = mount?.target ? String(mount.target) : null;
  const mountSource = mount?.source ? String(mount.source) : null;
  const hostRootMatch = mountSource?.match(/^\[(.+)\]$/);

  if (!mountTarget || !hostRootMatch) {
    return resolvedPath;
  }

  const relativePath = path.relative(mountTarget, resolvedPath);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return path.join(hostRootMatch[1], relativePath);
  }

  return resolvedPath;
}

function resolveHostBrowserPath(target) {
  const resolved = path.resolve(String(target));

  try {
    return translateMountedPath(resolved, getMountInfo(resolved));
  } catch {
    return resolved;
  }
}

function toBrowserTarget(target) {
  const value = String(target);
  if (value.includes("://")) return value;
  return pathToFileURL(resolveHostBrowserPath(value)).href;
}

function createBrowserSession(
  { normalizeBrowserOptions, runAgentBrowser },
  options = {},
) {
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

module.exports = {
  createBrowserSession,
  resolveHostBrowserPath,
  toBrowserTarget,
  translateMountedPath,
};
