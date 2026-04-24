"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
import { isRecord, toOptionalString } from "../coerce.js";
import type {
  BrowserSession,
  FeedBrowserConfig,
  NormalizedBrowserOptions,
} from "../types.js";

interface MountInfo {
  target: string | null;
  source: string | null;
}

interface BrowserTab {
  index: number;
  url?: string;
}

interface BrowserSessionDeps {
  normalizeBrowserOptions: (
    options?: FeedBrowserConfig,
  ) => NormalizedBrowserOptions;
  runAgentBrowser: (
    commandArgs: string[],
    options?: FeedBrowserConfig & { commandTimeoutMs?: number },
  ) => string;
}

function sleepMilliseconds(milliseconds: number): void {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    Math.max(0, milliseconds),
  );
}

function buildWaitArgs(
  kind: "milliseconds" | "load" | "url" | "text" | "function" | "selector",
  value: string | number,
  timeoutMs: number | null,
): string[] {
  const args = ["wait"];
  switch (kind) {
    case "milliseconds":
      args.push(String(value));
      break;
    case "load":
      args.push("--load", String(value));
      break;
    case "url":
      args.push("--url", String(value));
      break;
    case "text":
      args.push("--text", String(value));
      break;
    case "function":
      args.push("--fn", String(value));
      break;
    case "selector":
      args.push(String(value));
      break;
  }
  if (
    typeof timeoutMs === "number" &&
    Number.isInteger(timeoutMs) &&
    timeoutMs > 0
  ) {
    args.push("--timeout", String(timeoutMs));
  }
  return args;
}

function normalizeUrlPrefixes(urlPrefix: string | string[]): string[] {
  if (Array.isArray(urlPrefix)) {
    return urlPrefix.map((prefix) => String(prefix)).filter(Boolean);
  }
  return [String(urlPrefix)].filter(Boolean);
}

function parseFindmntPayload(payload: string): MountInfo | null {
  const parsed = JSON.parse(payload) as unknown;
  if (!isRecord(parsed)) return null;
  const filesystems = parsed.filesystems;
  if (!Array.isArray(filesystems) || filesystems.length === 0) return null;
  const filesystem = filesystems[0];
  if (!isRecord(filesystem)) return null;
  return {
    target: toOptionalString(filesystem.target, { coerce: false }),
    source: toOptionalString(filesystem.source, { coerce: false }),
  };
}

function parseBrowserTabList(payload: string): BrowserTab[] {
  const parsed = JSON.parse(payload) as unknown;
  if (!isRecord(parsed)) return [];
  const data = parsed.data;
  if (!isRecord(data) || !Array.isArray(data.tabs)) return [];
  return data.tabs.flatMap((tab): BrowserTab[] => {
    if (!isRecord(tab) || typeof tab.index !== "number") return [];
    return typeof tab.url === "string"
      ? [{ index: tab.index, url: tab.url }]
      : [{ index: tab.index }];
  });
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const details = [
    error.message,
    "stdout" in error ? String(error.stdout ?? "") : "",
    "stderr" in error ? String(error.stderr ?? "") : "",
  ];
  return details.join("\n");
}

function isWaitTimeoutError(error: unknown): boolean {
  return /\b(timeout|timed out|TimeoutError)\b/i.test(errorText(error));
}

function getMountInfo(targetPath: string): MountInfo | null {
  let lookupTarget = path.resolve(targetPath);
  while (!fs.existsSync(lookupTarget)) {
    const parent = path.dirname(lookupTarget);
    if (parent === lookupTarget) {
      throw new Error(`No existing path found for mount lookup: ${targetPath}`);
    }
    lookupTarget = parent;
  }
  try {
    const payload = execFileSync(
      "findmnt",
      ["-J", "-T", lookupTarget, "--output", "TARGET,SOURCE"],
      {
        encoding: "utf8",
      },
    );
    return parseFindmntPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`findmnt failed for ${lookupTarget}: ${message}`);
  }
}

function translateMountedPath(
  resolvedPath: string,
  mount: MountInfo | null,
): string {
  const mountTarget = mount?.target ?? null;
  const mountSource = mount?.source ?? null;
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

function resolveHostBrowserPath(target: string): string {
  const resolved = path.resolve(String(target));
  try {
    return translateMountedPath(resolved, getMountInfo(resolved));
  } catch {
    return resolved;
  }
}

function toBrowserTarget(target: string): string {
  const value = String(target);
  if (value.includes("://")) return value;
  return pathToFileURL(resolveHostBrowserPath(value)).href;
}

function createBrowserSession(
  { normalizeBrowserOptions, runAgentBrowser }: BrowserSessionDeps,
  options: FeedBrowserConfig = {},
): BrowserSession {
  const browserOptions = normalizeBrowserOptions(options);

  function run(
    commandArgs: string[],
    commandOptions: FeedBrowserConfig & { commandTimeoutMs?: number } = {},
  ): string {
    const mergedOptions = {
      ...browserOptions,
      ...commandOptions,
    };
    return runAgentBrowser(
      commandArgs,
      mergedOptions as FeedBrowserConfig & {
        commandTimeoutMs?: number;
      },
    );
  }

  function getCurrentUrl(): string {
    return run(["get", "url"]).replace(/\r/g, "");
  }

  function getTitle(): string {
    return run(["get", "title"]).replace(/\r/g, "");
  }

  function listTabs(): BrowserTab[] {
    return parseBrowserTabList(run(["tab", "list", "--json"]));
  }

  function switchToTab(index: number): void {
    run(["tab", String(index)]);
  }

  function openNewTab(url: string): void {
    run(["tab", "new", url]);
  }

  function waitMilliseconds(milliseconds: number): void {
    run(buildWaitArgs("milliseconds", milliseconds, null));
  }

  function waitForLoad(
    state = "networkidle",
    timeoutMs: number | null = null,
  ): void {
    run(buildWaitArgs("load", state, timeoutMs));
  }

  function tryWaitForLoad(
    state = "networkidle",
    timeoutMs: number | null = null,
  ): boolean {
    return waitOrTimeout(() => waitForLoad(state, timeoutMs));
  }

  function waitForUrl(
    urlPattern: string,
    timeoutMs: number | null = null,
  ): void {
    run(buildWaitArgs("url", urlPattern, timeoutMs));
  }

  function waitForText(text: string, timeoutMs: number | null = null): void {
    run(buildWaitArgs("text", text, timeoutMs));
  }

  function tryWaitForText(
    text: string,
    timeoutMs: number | null = null,
  ): boolean {
    return waitOrTimeout(() => waitForText(text, timeoutMs));
  }

  function waitForFunction(
    expression: string,
    timeoutMs: number | null = null,
  ): void {
    run(buildWaitArgs("function", expression, timeoutMs));
  }

  function tryWaitForFunction(
    expression: string,
    timeoutMs: number | null = null,
  ): boolean {
    return waitOrTimeout(() => waitForFunction(expression, timeoutMs));
  }

  function waitOrTimeout(wait: () => void): boolean {
    try {
      wait();
      return true;
    } catch (error) {
      if (!isWaitTimeoutError(error)) throw error;
      return false;
    }
  }

  function waitForSelector(
    selector: string,
    timeoutMs: number | null = null,
  ): void {
    run(buildWaitArgs("selector", selector, timeoutMs));
  }

  function openPathOrUrl(target: string): void {
    openNewTab(toBrowserTarget(target));
  }

  function reloadCurrentTab(): void {
    run(["reload"]);
  }

  function ensureTab(urlPrefix: string | string[], openUrl: string): string {
    const prefixes = normalizeUrlPrefixes(urlPrefix);

    function matchesPrefix(url: string): boolean {
      return prefixes.some((prefix) => String(url || "").startsWith(prefix));
    }

    function pollCurrentUrl(timeoutMs = 5000): string {
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

  function evalJson<T = unknown>(script: string): T {
    const parsed = JSON.parse(run(["eval", script])) as unknown;
    if (typeof parsed === "string") {
      return JSON.parse(parsed) as T;
    }
    return parsed as T;
  }

  function evalText(script: string): string {
    return run(["eval", script]);
  }

  function snapshotText(options = ["-c"], timeoutMs = 15000): string {
    return run(["snapshot", ...options], { commandTimeoutMs: timeoutMs });
  }

  function getHtml(selector: string, timeoutMs = 5000): string {
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
  toBrowserTarget,
  translateMountedPath,
};
