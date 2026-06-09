import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createBrowserSession } from "./browser.ts";
import { getBrowserStatus } from "./browser-status.ts";

const WORKDIR = path.resolve(
  process.env.FEED_TOOLS_WORKDIR || path.resolve(import.meta.dirname, ".."),
);
const DEFAULT_CHROME_PROFILE = path.join(WORKDIR, "chrome-profile");
const DEFAULT_CHROME_LOG = path.join(WORKDIR, "chrome.log");
const WORKSPACE_CHROME_BIN = path.join(
  WORKDIR,
  "chrome-install",
  "opt",
  "google",
  "chrome",
  "google-chrome",
);
const DEFAULT_CDP_PORT = 9223;
const CDP_PROBE_TIMEOUT_MS = 20_000;

export interface BrowserStartOptions {
  cdpPort?: number;
  profileDir?: string;
  chromeBin?: string;
  urls?: string[];
  reuseExisting?: boolean;
  noSandbox?: boolean;
  logPath?: string;
}

export interface BrowserStartResult {
  ok: boolean;
  cdp: string;
  profileDir: string;
  chromeBin: string;
  logPath: string;
  launched: boolean;
  pid?: number;
  version?: string | null;
  detail: string;
}

function commandExists(command: string): boolean {
  return (
    spawnSync("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore",
    }).status === 0
  );
}

function commandPath(command: string): string | null {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function resolveChromeBin(explicit?: string | null): string | null {
  if (explicit) {
    const candidate = path.resolve(explicit);
    return fs.existsSync(candidate) ? candidate : null;
  }
  if (process.env.FEED_TOOLS_CHROME_BIN) {
    const candidate = path.resolve(process.env.FEED_TOOLS_CHROME_BIN);
    return fs.existsSync(candidate) ? candidate : null;
  }
  if (fs.existsSync(WORKSPACE_CHROME_BIN)) return WORKSPACE_CHROME_BIN;
  for (const command of [
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ]) {
    if (commandExists(command)) return commandPath(command);
  }
  return null;
}

function sleepMilliseconds(milliseconds: number): void {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    Math.max(0, milliseconds),
  );
}

function defaultProfileDir(): string {
  return path.resolve(
    process.env.FEED_TOOLS_CHROME_PROFILE || DEFAULT_CHROME_PROFILE,
  );
}

function defaultCdpPort(): number {
  const raw = process.env.FEED_TOOLS_CDP || String(DEFAULT_CDP_PORT);
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_CDP_PORT;
}

function shouldUseNoSandbox(value: boolean | undefined): boolean {
  if (value !== undefined) return value;
  return (
    (typeof process.getuid === "function" && process.getuid() === 0) ||
    Boolean(process.env.CONTAINER) ||
    fs.existsSync("/.dockerenv")
  );
}

function openUrls(cdp: string, urls: string[] | undefined): void {
  if (!urls || urls.length === 0) return;
  const browser = createBrowserSession({ cdp, autoConnect: false });
  for (const url of urls) {
    browser.openNewTab(url);
  }
}

export function startBrowser(
  options: BrowserStartOptions = {},
): BrowserStartResult {
  const cdpPort = options.cdpPort || defaultCdpPort();
  const cdp = String(cdpPort);
  const profileDir = path.resolve(options.profileDir || defaultProfileDir());
  const logPath = path.resolve(options.logPath || DEFAULT_CHROME_LOG);
  const chromeBin = resolveChromeBin(options.chromeBin);
  const reuseExisting = options.reuseExisting !== false;

  const existing = getBrowserStatus(cdp);
  if (existing.ok && reuseExisting) {
    openUrls(cdp, options.urls);
    return {
      ok: true,
      cdp,
      profileDir,
      chromeBin: chromeBin || "",
      logPath,
      launched: false,
      version: existing.browser,
      detail: `Reusing existing CDP endpoint ${cdp}.`,
    };
  }
  if (existing.ok) {
    throw new Error(
      `CDP port ${cdp} is already occupied by ${existing.browser || "a Chrome DevTools Protocol endpoint"}. Set reuse_existing=true to reuse it or choose another cdp_port.`,
    );
  }

  if (!chromeBin) {
    throw new Error(
      "Chrome binary not found. Install Chrome/Chromium or set FEED_TOOLS_CHROME_BIN.",
    );
  }

  if (existing.detail.includes("webSocketDebuggerUrl") || existing.versionUrl) {
    throw new Error(
      `CDP port ${cdp} is occupied by a non-CDP browser endpoint: ${existing.detail}`,
    );
  }

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, "a");
  const args = [
    `--remote-debugging-port=${cdp}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=LockProfileCookieDatabase",
    ...(shouldUseNoSandbox(options.noSandbox) ? ["--no-sandbox"] : []),
    ...(options.urls || []),
  ];
  const child: ChildProcess = spawn(chromeBin, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
  });

  const deadline = Date.now() + CDP_PROBE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = getBrowserStatus(cdp);
    if (status.ok) {
      child.unref();
      return {
        ok: true,
        cdp,
        profileDir,
        chromeBin,
        logPath,
        launched: true,
        pid: child.pid,
        version: status.browser,
        detail: `Chrome launched on CDP port ${cdp}.`,
      };
    }
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited before CDP was ready; see ${logPath}`);
    }
    sleepMilliseconds(500);
  }

  try {
    if (child.pid) process.kill(child.pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
  throw new Error(`Chrome did not expose CDP on port ${cdp}; see ${logPath}`);
}
