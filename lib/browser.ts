import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createBrowserSession as createSession } from "./browser/session.ts";
import type {
  BrowserSession,
  FeedBrowserConfig,
  NormalizedBrowserOptions,
} from "./types.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_COMMAND_TIMEOUT_MS = 45000;
const AGENT_BROWSER_IGNORED_WARNING_PATTERN =
  /^⚠ --args ignored: daemon already running\..*$/gm;
const CDP_PROBE_TIMEOUT_MS = 2000;

function agentBrowserCommand(): string {
  const localBinary = path.resolve(
    import.meta.dirname,
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agent-browser.cmd" : "agent-browser",
  );
  return fs.existsSync(localBinary) ? localBinary : "agent-browser";
}

function toStringList(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "")).filter(Boolean);
  }
  if (value == null || value === "") return [];
  return [String(value)];
}

function pickStringOption(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    return String(value);
  }
  return null;
}

function resolveConfigPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const resolved = path.isAbsolute(value)
    ? value
    : path.resolve(REPO_ROOT, value);
  return resolved;
}

export function normalizeBrowserOptions(
  options: FeedBrowserConfig = {},
): NormalizedBrowserOptions {
  const cdp = pickStringOption(options.cdp ?? null);
  return {
    autoConnect: options.autoConnect !== false && !cdp,
    session: pickStringOption(options.session ?? null),
    sessionName: pickStringOption(options.sessionName ?? null),
    profile: resolveConfigPath(options.profile ?? null),
    statePath: resolveConfigPath(options.statePath ?? null),
    headed: options.headed === true && !cdp,
    allowFileAccess: options.allowFileAccess === true,
    colorScheme: pickStringOption(options.colorScheme ?? null),
    executablePath: resolveConfigPath(options.executablePath ?? null),
    cdp,
    args: toStringList(options.args ?? null),
  };
}

export function getRuntimeBrowserOptions(
  options: FeedBrowserConfig = {},
): NormalizedBrowserOptions {
  const normalized = normalizeBrowserOptions(options);
  const {
    autoConnect,
    session,
    sessionName,
    allowFileAccess,
    colorScheme,
    cdp,
  } = normalized;
  return {
    autoConnect,
    session,
    sessionName,
    profile: null,
    statePath: null,
    headed: false,
    allowFileAccess,
    colorScheme,
    executablePath: null,
    cdp,
    args: [],
  };
}

export function buildAgentBrowserArgs(
  options: FeedBrowserConfig = {},
  commandArgs: string[] = [],
): string[] {
  const normalized = normalizeBrowserOptions(options);
  const args: string[] = [];

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

export function getCdpVersionUrl(cdp: string): string {
  return getCdpVersionUrls(cdp)[0] ?? String(cdp || "").trim();
}

export function getCdpVersionUrls(cdp: string): string[] {
  const value = String(cdp || "").trim();
  if (/^\d+$/.test(value)) {
    return [
      `http://127.0.0.1:${value}/json/version`,
      `http://localhost:${value}/json/version`,
      `http://[::1]:${value}/json/version`,
    ];
  }
  if (/^https?:\/\//i.test(value)) {
    return [new URL("/json/version", value).toString()];
  }
  if (/^[^/]+:\d+$/.test(value)) {
    return [`http://${value}/json/version`];
  }
  return [value];
}

export function readCdpVersionPayload(url: string): string {
  const script = `
const url = process.argv[1];
const timeoutMs = Number(process.argv[2]);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);
	fetch(url, { signal: controller.signal })
	  .then(async (response) => {
	    if (!response.ok) {
	      process.stderr.write(String(response.status));
	      process.exit(1);
	    }
	    process.stdout.write(await response.text());
	  })
	  .catch((error) => {
	    process.stderr.write(error instanceof Error ? error.message : "CDP probe failed");
	    process.exit(1);
	  })
	  .finally(() => clearTimeout(timeout));
`;
  return execFileSync(process.execPath, ["-e", script, url, "2000"], {
    encoding: "utf8",
    timeout: CDP_PROBE_TIMEOUT_MS + 1000,
  });
}

function cdpValueForUrl(input: string, url: string): string {
  if (!/^\d+$/.test(String(input || "").trim())) return input;
  const parsed = new URL(url);
  if (parsed.hostname === "127.0.0.1") return input;
  return parsed.origin;
}

export function assertCdpEndpoint(cdp: string): string {
  const urls = getCdpVersionUrls(cdp);
  const failures: string[] = [];
  const invalids: string[] = [];
  let output = "";
  for (const url of urls) {
    try {
      output = readCdpVersionPayload(url);
    } catch {
      failures.push(url);
      continue;
    }

    try {
      const parsed = JSON.parse(output) as { webSocketDebuggerUrl?: unknown };
      if (typeof parsed.webSocketDebuggerUrl === "string") {
        return cdpValueForUrl(cdp, url);
      }
    } catch {
      invalids.push(url);
      continue;
    }

    invalids.push(url);
  }

  if (invalids.length > 0) {
    throw new Error(
      `CDP endpoint ${cdp} responded at ${invalids.join(", ")}, but it did not look like Chrome DevTools Protocol JSON. Use a dedicated Chrome debugging port for feed capture.`,
    );
  }
  throw new Error(
    `CDP endpoint ${cdp} did not respond at ${failures.join(", ")}. If port ${cdp} is owned by Codex Desktop or another embedded browser, launch a dedicated Chrome profile on another port such as 9223 and set capture.browser.cdp to that port.`,
  );
}

function runAgentBrowser(
  commandArgs: string[],
  options: FeedBrowserConfig & { commandTimeoutMs?: number } = {},
): string {
  const { commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, ...browserOptions } =
    options;
  const normalized = normalizeBrowserOptions(browserOptions);
  let effectiveOptions = normalized;
  if (normalized.cdp) {
    effectiveOptions = {
      ...normalized,
      cdp: assertCdpEndpoint(normalized.cdp),
    };
  }
  return execFileSync(
    agentBrowserCommand(),
    buildAgentBrowserArgs(effectiveOptions, commandArgs),
    {
      encoding: "utf8",
      timeout: commandTimeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    },
  )
    .replace(AGENT_BROWSER_IGNORED_WARNING_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function jitterTimeout(baseMs: number, spreadMs = 750): number {
  const base = Math.max(0, Number(baseMs) || 0);
  const spread = Math.max(0, Number(spreadMs) || 0);
  if (spread === 0) return base;
  return base + Math.floor(Math.random() * (spread + 1));
}

export function closeBrowserSession(options: FeedBrowserConfig = {}): boolean {
  const normalized = normalizeBrowserOptions(options);
  if (!normalized.session) return false;
  runAgentBrowser(["close"], {
    session: normalized.session,
    autoConnect: false,
  });
  return true;
}

export function createBrowserSession(
  options: FeedBrowserConfig = {},
): BrowserSession {
  return createSession(
    {
      normalizeBrowserOptions,
      runAgentBrowser,
    },
    options,
  );
}
