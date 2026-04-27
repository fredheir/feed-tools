#!/usr/bin/env node
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getCdpVersionUrls } from "./browser.ts";
import { isSupportedSource, listSupportedSources } from "./source-catalog.ts";
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
const CHROME_PROFILE = path.join(REPO_ROOT, "chrome-profile");
const CHROME_LOG = path.join(REPO_ROOT, "chrome.log");
const DEFAULT_CDP_PORT = "9222";
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

interface SourceSigninTarget {
  url: string;
  authCookies: Array<{ domains: string[]; names: string[] }>;
}

interface ParsedArgs {
  sources: FeedSourceName[];
  cdpPort: string;
  intervalMs: number;
  timeoutMs: number;
}

const SOURCE_TARGETS: Record<FeedSourceName, SourceSigninTarget> = {
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

function usage(): never {
  console.log(
    [
      "Usage: feed-signin <source>... [--cdp PORT] [--interval SECONDS] [--timeout MINUTES]",
      "",
      "Launches workspace Chrome, opens source login/feed pages, and waits until",
      "the persistent chrome-profile cookie DB contains auth cookies for each source.",
    ].join("\n"),
  );
  process.exit(0);
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  const sources: FeedSourceName[] = [];
  let cdpPort = DEFAULT_CDP_PORT;
  let intervalMs = DEFAULT_INTERVAL_MS;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "-h" || arg === "--help") usage();
    if (arg === "--cdp") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error("Missing value for --cdp");
      if (!/^\d+$/.test(value)) throw new Error(`Invalid --cdp port: ${value}`);
      cdpPort = value;
      index += 1;
      continue;
    }
    if (arg === "--interval") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error("Missing value for --interval");
      intervalMs = parsePositiveInteger(value, "--interval") * 1000;
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error("Missing value for --timeout");
      timeoutMs = parsePositiveInteger(value, "--timeout") * 60_000;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    if (!isSupportedSource(arg)) throw new Error(`Unsupported source: ${arg}`);
    sources.push(arg);
  }

  if (sources.length === 0) {
    throw new Error(
      `Provide at least one source: ${listSupportedSources().join(", ")}`,
    );
  }
  return { sources, cdpPort, intervalMs, timeoutMs };
}

function commandExists(command: string): boolean {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
  } catch {
    throw new Error(`${python} is available but cannot import sqlite3`);
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
    try {
      execFileSync(process.execPath, ["-e", script, url], {
        stdio: "ignore",
        timeout: 2000,
      });
      return url;
    } catch {
      continue;
    }
  }
  return null;
}

async function waitForCdp(cdpPort: string, child: ChildProcess): Promise<void> {
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

function quotePythonJson(value: unknown): string {
  return JSON.stringify(value);
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

  try {
    execFileSync(
      python,
      [
        "-c",
        script,
        quotePythonJson(cookieStores),
        quotePythonJson(authCookies),
      ],
      { stdio: "ignore", timeout: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

function getSigninStatus(
  sources: FeedSourceName[],
): Record<FeedSourceName, boolean> {
  const stores = findCookieStores(CHROME_PROFILE);
  const status = {} as Record<FeedSourceName, boolean>;
  for (const source of sources) {
    status[source] = hasAuthCookie(stores, SOURCE_TARGETS[source].authCookies);
  }
  return status;
}

function formatStatus(status: Record<FeedSourceName, boolean>): string {
  return Object.entries(status)
    .map(([source, ok]) => `${source} ${ok ? "ok" : "pending"}`)
    .join(" | ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchChrome(args: ParsedArgs): ChildProcess {
  if (!fs.existsSync(CHROME_BIN)) {
    throw new Error(
      `Chrome binary not found: ${CHROME_BIN}. Run ./bin/feed-setup-sandbox first.`,
    );
  }
  if (readCdpVersion(args.cdpPort)) {
    throw new Error(
      `CDP port ${args.cdpPort} is already in use; choose another port with --cdp`,
    );
  }
  fs.mkdirSync(CHROME_PROFILE, { recursive: true });
  const logFd = fs.openSync(CHROME_LOG, "a");
  return spawn(
    CHROME_BIN,
    [
      `--remote-debugging-port=${args.cdpPort}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${CHROME_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=LockProfileCookieDatabase",
      "--no-sandbox",
      ...args.sources.map((source) => SOURCE_TARGETS[source].url),
    ],
    {
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    },
  );
}

function closeChrome(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  child.kill("SIGTERM");
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  assertPythonSqliteAvailable();
  const child = launchChrome(args);
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    closeChrome(child);
  });
  process.on("SIGTERM", () => {
    interrupted = true;
    closeChrome(child);
  });

  const deadline = Date.now() + args.timeoutMs;
  console.log(
    `Chrome launched on CDP port ${args.cdpPort}; log: ${CHROME_LOG}`,
  );
  console.log(`Profile: ${CHROME_PROFILE}`);
  try {
    await waitForCdp(args.cdpPort, child);
    console.log(
      "Sign in in the opened browser window. Waiting for auth cookies...",
    );

    while (!interrupted && Date.now() < deadline) {
      const status = getSigninStatus(args.sources);
      console.log(`${new Date().toISOString()} ${formatStatus(status)}`);
      if (Object.values(status).every(Boolean)) {
        console.log(
          "Sign-in auth cookies detected. Closing Chrome to flush profile state.",
        );
        return;
      }
      if (child.exitCode !== null) {
        throw new Error(
          `Chrome exited before sign-in completed; see ${CHROME_LOG}`,
        );
      }
      await sleep(args.intervalMs);
    }

    throw new Error(
      interrupted
        ? "Sign-in interrupted before auth cookies were detected"
        : "Timed out waiting for sign-in auth cookies",
    );
  } finally {
    closeChrome(child);
  }
}
