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
  cdp?: string;
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

function isExecutableFile(candidate: string): boolean {
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  return Boolean(stat?.isFile() && (stat.mode & 0o111) !== 0);
}

export function resolveChromeBin(explicit?: string | null): string | null {
  if (explicit) {
    const candidate = path.resolve(explicit);
    return isExecutableFile(candidate) ? candidate : null;
  }
  if (process.env.FEED_TOOLS_CHROME_BIN) {
    const candidate = path.resolve(process.env.FEED_TOOLS_CHROME_BIN);
    return isExecutableFile(candidate) ? candidate : null;
  }
  if (isExecutableFile(WORKSPACE_CHROME_BIN)) return WORKSPACE_CHROME_BIN;
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

function sleepMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultProfileDir(): string {
  return path.resolve(
    process.env.FEED_TOOLS_CHROME_PROFILE || DEFAULT_CHROME_PROFILE,
  );
}

function defaultCdp(): string {
  const raw = process.env.FEED_TOOLS_CDP || String(DEFAULT_CDP_PORT);
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 ? String(port) : raw;
}

function cdpLaunchPort(cdp: string): string {
  const value = cdp.trim();
  if (/^\d+$/.test(value)) return value;
  const parsed = new URL(
    /^https?:\/\//i.test(value) ? value : `http://${value}`,
  );
  if (parsed.port) return parsed.port;
  throw new Error(`CDP endpoint ${cdp} does not include a launchable port.`);
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

export async function startBrowser(
  options: BrowserStartOptions = {},
): Promise<BrowserStartResult> {
  const cdp = options.cdp || String(options.cdpPort || defaultCdp());
  const launchCdp = cdpLaunchPort(cdp);
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
    `--remote-debugging-port=${launchCdp}`,
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
  let childError: Error | null = null;
  child.once("error", (error) => {
    childError = error;
  });

  const deadline = Date.now() + CDP_PROBE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = getBrowserStatus(launchCdp);
    if (status.ok) {
      child.unref();
      return {
        ok: true,
        cdp: launchCdp,
        profileDir,
        chromeBin,
        logPath,
        launched: true,
        pid: child.pid,
        version: status.browser,
        detail: `Chrome launched on CDP port ${cdp}.`,
      };
    }
    if (childError) {
      throw childError;
    }
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited before CDP was ready; see ${logPath}`);
    }
    await sleepMilliseconds(500);
  }

  try {
    if (child.pid) process.kill(child.pid, "SIGTERM");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ESRCH"
    ) {
      throw error;
    }
  }
  throw new Error(`Chrome did not expose CDP on port ${cdp}; see ${logPath}`);
}
