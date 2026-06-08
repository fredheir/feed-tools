import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getCdpVersionUrls } from "./browser.ts";
import { listSupportedSources } from "./source-catalog.ts";
import type { FeedSourceName } from "./types.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CHROME_BIN = path.join(
  REPO_ROOT,
  "chrome-install",
  "opt",
  "google",
  "chrome",
  "google-chrome",
);
export const CHROME_PROFILE = path.join(REPO_ROOT, "chrome-profile");
const CHROME_LOG = path.join(REPO_ROOT, "chrome.log");
export const DEFAULT_CDP_PORT = "9222";
export const DEFAULT_INTERVAL_MS = 30_000;
export const DEFAULT_TIMEOUT_MS = 20 * 60_000;

interface SourceSigninTarget {
  url: string;
  authCookies: Array<{ domains: string[]; names: string[] }>;
}

export interface SigninStatusResult {
  profileDir: string;
  cookieStoresFound: number;
  status: Partial<Record<FeedSourceName, boolean>>;
  missing: FeedSourceName[];
}

type FeedSigninChromeProcess = ChildProcess & {
  logPath: string;
  profileDir: string;
};

export const SOURCE_TARGETS: Record<FeedSourceName, SourceSigninTarget> = {
  x: {
    url: "https://x.com/home",
    authCookies: [{ domains: ["x.com", "twitter.com"], names: ["auth_token"] }],
  },
  bluesky: {
    url: "https://bsky.app/",
    authCookies: [
      { domains: ["bsky.app", "bsky.social"], names: ["sid", "session"] },
    ],
  },
  facebook: {
    url: "https://www.facebook.com/",
    authCookies: [{ domains: ["facebook.com"], names: ["c_user"] }],
  },
  instagram: {
    url: "https://www.instagram.com/",
    authCookies: [{ domains: ["instagram.com"], names: ["sessionid"] }],
  },
  linkedin: {
    url: "https://www.linkedin.com/feed/",
    authCookies: [{ domains: ["linkedin.com"], names: ["li_at"] }],
  },
  tiktok: {
    url: "https://www.tiktok.com/",
    authCookies: [
      { domains: ["tiktok.com"], names: ["sessionid", "sessionid_ss"] },
    ],
  },
  youtube: {
    url: "https://www.youtube.com/",
    authCookies: [
      {
        domains: ["youtube.com", "google.com"],
        names: ["SID", "HSID", "SSID", "APISID", "SAPISID"],
      },
    ],
  },
};

export function listSupportedSigninSources(): FeedSourceName[] {
  return listSupportedSources().filter((source) =>
    Boolean(SOURCE_TARGETS[source]),
  );
}

function commandExists(command: string): boolean {
  return (
    spawnSync("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore",
    }).status === 0
  );
}

function findPythonCommand(): string | null {
  if (commandExists("python3")) return "python3";
  if (commandExists("python")) return "python";
  return null;
}

function assertPythonSqliteAvailable(): void {
  const python = findPythonCommand();
  if (!python) {
    throw new Error(
      "feed-signin requires python3 or python with sqlite3 support",
    );
  }
  try {
    execFileSync(python, ["-c", "import sqlite3"], {
      stdio: "ignore",
      timeout: 5000,
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    throw new Error(`${python} is available but cannot import sqlite3`, {
      cause: error,
    });
  }
}

function readCdpVersion(cdpPort: string): string | null {
  const script = `
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 1000);
fetch(process.argv[1], { signal: controller.signal })
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1))
  .finally(() => clearTimeout(timeout));
`;
  for (const url of getCdpVersionUrls(cdpPort)) {
    const result = spawnSync(process.execPath, ["-e", script, url], {
      stdio: "ignore",
      timeout: 2000,
    });
    if (result.status === 0) {
      return url;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForCdp(
  cdpPort: string,
  child: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (readCdpVersion(cdpPort)) return;
    if (child.exitCode !== null) {
      throw new Error(`Chrome exited before CDP was ready; see ${CHROME_LOG}`);
    }
    await sleep(500);
  }
  throw new Error(
    `Chrome did not expose CDP at ${getCdpVersionUrls(cdpPort).join(", ")}; see ${CHROME_LOG}`,
  );
}

export function findCookieStores(profileDir: string): string[] {
  const stores: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: profileDir, depth: 0 },
  ];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth > 4) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name === "Cookies") {
        stores.push(entryPath);
      } else if (entry.isDirectory()) {
        queue.push({ dir: entryPath, depth: current.depth + 1 });
      }
    }
  }
  return stores;
}

export function hasAuthCookie(
  cookieStores: string[],
  authCookies: SourceSigninTarget["authCookies"],
): boolean {
  const python = findPythonCommand();
  if (!python || cookieStores.length === 0) return false;

  const script = `
import json
import sqlite3
import sys

stores = json.loads(sys.argv[1])
auth_cookies = json.loads(sys.argv[2])

for store in stores:
    try:
        connection = sqlite3.connect(f"file:{store}?mode=ro", uri=True, timeout=1)
        try:
            rows = connection.execute("select host_key, name from cookies").fetchall()
        finally:
            connection.close()
    except Exception:
        continue
    for (host_key, cookie_name) in rows:
        host = str(host_key or "").lstrip(".").lower()
        name = str(cookie_name or "")
        for check in auth_cookies:
            names = set(str(candidate) for candidate in check["names"])
            if name not in names:
                continue
            for domain in check["domains"]:
                expected = str(domain).lower()
                if host == expected or host.endswith("." + expected):
                    sys.exit(0)
sys.exit(1)
`;

  const result = spawnSync(
    python,
    ["-c", script, JSON.stringify(cookieStores), JSON.stringify(authCookies)],
    { stdio: "ignore", timeout: 5000 },
  );
  return result.status === 0;
}

export function getSigninStatus(
  sources: FeedSourceName[],
  profileDir = CHROME_PROFILE,
): SigninStatusResult {
  const stores = findCookieStores(profileDir);
  const status: Partial<Record<FeedSourceName, boolean>> = {};
  for (const source of sources) {
    status[source] = hasAuthCookie(stores, SOURCE_TARGETS[source].authCookies);
  }
  return {
    profileDir,
    cookieStoresFound: stores.length,
    status,
    missing: sources.filter((source) => !status[source]),
  };
}

function formatStatus(
  status: Partial<Record<FeedSourceName, boolean>>,
): string {
  return Object.entries(status)
    .map(([source, ok]) => `${source} ${ok ? "ok" : "pending"}`)
    .join(" | ");
}

export function launchChrome({
  sources,
  cdpPort = DEFAULT_CDP_PORT,
  chromeBin = CHROME_BIN,
  profileDir = CHROME_PROFILE,
  logPath = CHROME_LOG,
}: {
  sources: FeedSourceName[];
  cdpPort?: string;
  chromeBin?: string;
  profileDir?: string;
  logPath?: string;
}): FeedSigninChromeProcess {
  assertPythonSqliteAvailable();
  if (!fs.existsSync(chromeBin)) {
    throw new Error(
      `Chrome binary not found: ${chromeBin}. Run ./bin/feed-setup-sandbox first.`,
    );
  }
  if (readCdpVersion(cdpPort)) {
    throw new Error(
      `CDP port ${cdpPort} is already in use; choose another port with --cdp`,
    );
  }
  fs.mkdirSync(profileDir, { recursive: true });
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(
    chromeBin,
    [
      `--remote-debugging-port=${cdpPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=LockProfileCookieDatabase",
      "--no-sandbox",
      ...sources.map((source) => SOURCE_TARGETS[source].url),
    ],
    {
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    },
  ) as FeedSigninChromeProcess;
  child.logPath = logPath;
  child.profileDir = profileDir;
  return child;
}

export function closeChrome(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  child.kill("SIGTERM");
}

export async function runSigninWait({
  sources,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  profileDir = CHROME_PROFILE,
  child,
  isInterrupted = () => false,
  onStatus,
}: {
  sources: FeedSourceName[];
  intervalMs?: number;
  timeoutMs?: number;
  profileDir?: string;
  child?: ChildProcess;
  isInterrupted?: () => boolean;
  onStatus?: (status: SigninStatusResult & { text: string }) => void;
}): Promise<SigninStatusResult> {
  const deadline = Date.now() + timeoutMs;
  while (!isInterrupted() && Date.now() < deadline) {
    const status = getSigninStatus(sources, profileDir);
    onStatus?.({ ...status, text: formatStatus(status.status) });
    if (status.missing.length === 0) return status;
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(
        `Chrome exited before sign-in completed; see ${CHROME_LOG}`,
      );
    }
    await sleep(intervalMs);
  }

  throw new Error(
    isInterrupted()
      ? "Sign-in interrupted before auth cookies were detected"
      : "Timed out waiting for sign-in auth cookies",
  );
}
