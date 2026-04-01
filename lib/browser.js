"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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

function runAgentBrowser(args) {
  return execFileSync(agentBrowserCommand(), ["--auto-connect", ...args], {
    encoding: "utf8",
  }).trim();
}

function getCurrentUrl() {
  return runAgentBrowser(["get", "url"]).replace(/\r/g, "");
}

function listTabs() {
  const payload = JSON.parse(runAgentBrowser(["tab", "list", "--json"]));
  return payload?.data?.tabs || [];
}

function switchToTab(index) {
  runAgentBrowser(["tab", String(index)]);
}

function openNewTab(url) {
  runAgentBrowser(["tab", "new", url]);
}

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function ensureTab(urlPrefix, openUrl) {
  let currentUrl = getCurrentUrl();
  if (currentUrl.startsWith(urlPrefix)) return currentUrl;

  const existingTab = listTabs().find(
    (tab) => typeof tab.url === "string" && tab.url.startsWith(urlPrefix),
  );
  if (existingTab) {
    switchToTab(existingTab.index);
  } else {
    openNewTab(openUrl);
  }

  sleepSeconds(1);
  currentUrl = getCurrentUrl();
  if (!currentUrl.startsWith(urlPrefix)) {
    throw new Error(
      `Could not activate tab for ${urlPrefix}. Current tab: ${currentUrl}`,
    );
  }
  return currentUrl;
}

function evalJson(script) {
  const parsed = JSON.parse(runAgentBrowser(["eval", script]));
  if (typeof parsed === "string") {
    return JSON.parse(parsed);
  }
  return parsed;
}

function evalText(script) {
  return runAgentBrowser(["eval", script]);
}

module.exports = {
  ensureTab,
  evalJson,
  evalText,
};
