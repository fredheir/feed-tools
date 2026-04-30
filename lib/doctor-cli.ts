#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { getCdpVersionUrls, readCdpVersionPayload } from "./browser.ts";

import { listCicSources } from "./cic/source-config.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_CDP_PORTS = [9222, 9223, 9333];
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, "config.json.example");
const WORKSPACE_CHROME_BIN = path.join(
  REPO_ROOT,
  "chrome-install",
  "opt",
  "google",
  "chrome",
  "google-chrome",
);
const WORKSPACE_CHROME_PROFILE = path.join(REPO_ROOT, "chrome-profile");

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  recommendation?: string;
}

interface ConfigResult {
  status: "created" | "exists" | "skipped" | "unavailable";
  detail: string;
  path?: string;
}

interface SandboxSignal {
  name: string;
  detail: string;
}

type RecommendedBrowserConfig = Record<string, never> | { cdp: string };

function usage(): never {
  console.log(
    "Usage: feed-doctor [--json] [--no-config] [--write-config] [--cdp PORT] [--cdp PORT]...\n\nChecks capture paths, reports sandbox setup gaps, and creates config.json from config.json.example when a browser path is verified.",
  );
  process.exit(0);
}

function parseArgs(argv: string[]): {
  json: boolean;
  cdpPorts: number[];
  configure: boolean;
  forceConfig: boolean;
} {
  let json = false;
  let configure = true;
  let forceConfig = false;
  const cdpPorts: number[] = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") usage();
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--no-config") {
      configure = false;
      continue;
    }
    if (arg === "--write-config") {
      configure = true;
      forceConfig = true;
      continue;
    }
    if (arg === "--cdp") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --cdp");
      }
      const port = Number.parseInt(value, 10);
      if (Number.isNaN(port)) {
        throw new Error(`Invalid --cdp port: ${value}`);
      }
      cdpPorts.push(port);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return {
    json,
    cdpPorts: cdpPorts.length ? cdpPorts : DEFAULT_CDP_PORTS,
    configure,
    forceConfig,
  };
}

function localAgentBrowserBinary(): string {
  return path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agent-browser.cmd" : "agent-browser",
  );
}

function commandResponds(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function checkAgentBrowser(): CheckResult {
  const command = fs.existsSync(localAgentBrowserBinary())
    ? localAgentBrowserBinary()
    : "agent-browser";
  const version = commandResponds(command, ["--version"]);
  if (version !== null) {
    return {
      name: "agent-browser",
      ok: true,
      detail: version || `${command} responded`,
      recommendation:
        "Use browser: {} or omit capture.browser so feed-capture can auto-connect through agent-browser.",
    };
  }
  return {
    name: "agent-browser",
    ok: false,
    detail: "agent-browser did not respond",
    recommendation: "Run pnpm install, then retry ./bin/feed-doctor.",
  };
}

function cdpConfigValue(port: number, url: string): string {
  const parsed = new URL(url);
  return parsed.hostname === "127.0.0.1" ? String(port) : parsed.origin;
}

function getCdpVersion(port: number): CheckResult {
  const urls = getCdpVersionUrls(String(port));
  const misses: string[] = [];
  const invalids: string[] = [];
  for (const url of urls) {
    let output = "";
    try {
      output = readCdpVersionPayload(url);
    } catch {
      misses.push(url);
      continue;
    }
    let parsed: { Browser?: unknown; webSocketDebuggerUrl?: unknown };
    try {
      parsed = JSON.parse(output) as {
        Browser?: unknown;
        webSocketDebuggerUrl?: unknown;
      };
      if (typeof parsed.webSocketDebuggerUrl === "string") {
        const cdp = cdpConfigValue(port, url);
        return {
          name: `cdp:${port}`,
          ok: true,
          detail: `${String(parsed.Browser || "Chrome DevTools Protocol endpoint")} at ${url}`,
          recommendation: `Set capture.browser.cdp to "${cdp}".`,
        };
      }
    } catch {
      invalids.push(`${url} did not return JSON`);
      continue;
    }
    invalids.push(`${url} did not include webSocketDebuggerUrl`);
  }
  const detail =
    invalids.length > 0
      ? invalids.join("; ")
      : `${misses.join(", ")} are not usable CDP endpoints`;
  return {
    name: `cdp:${port}`,
    ok: false,
    detail,
    recommendation:
      invalids.length > 0
        ? "Do not use this port for CDP capture; try agent-browser or launch dedicated Chrome with --remote-debugging-port."
        : undefined,
  };
}

function checkCdpPorts(ports: number[]): CheckResult[] {
  return ports.map((port) => getCdpVersion(port));
}

export function detectSandboxSignals(env = process.env): SandboxSignal[] {
  const signals: SandboxSignal[] = [];
  for (const name of [
    "CODEX_SANDBOX",
    "CODEX_ENV",
    "CLAUDECODE",
    "CLAUDE_CODE",
    "CLAUDE_CODE_IS_COWORK",
    "COWORK",
    "CONTAINER",
  ]) {
    if (env[name]) signals.push({ name, detail: `${name} is set` });
  }
  if (fs.existsSync("/.dockerenv")) {
    signals.push({ name: "dockerenv", detail: "/.dockerenv is present" });
  }
  if (fs.existsSync("/run/.containerenv")) {
    signals.push({
      name: "containerenv",
      detail: "/run/.containerenv is present",
    });
  }
  if (/\/sessions\/[^/]+\/mnt\//.test(REPO_ROOT)) {
    signals.push({
      name: "session-mount",
      detail: "repo is under an ephemeral session mount",
    });
  }
  if (env.HOME) {
    try {
      fs.accessSync(env.HOME, fs.constants.W_OK);
    } catch {
      signals.push({ name: "home", detail: `${env.HOME} is not writable` });
    }
  }
  return signals;
}

function isCoworkEnvironment(): boolean {
  return (
    Boolean(process.env.CLAUDE_CODE_IS_COWORK) ||
    !process.env.DBUS_SESSION_BUS_ADDRESS
  );
}

function checkSandbox(): CheckResult {
  const signals = detectSandboxSignals();
  if (signals.length === 0) {
    return {
      name: "sandbox",
      ok: true,
      detail: "no sandbox markers detected",
    };
  }
  return {
    name: "sandbox",
    ok: true,
    detail: signals.map((signal) => signal.detail).join("; "),
    recommendation:
      "Use a workspace Chrome install/profile and CDP. See AGENTS.md Sandbox / ephemeral environment.",
  };
}

function isSandbox(results: CheckResult[]): boolean {
  const sandbox = results.find((result) => result.name === "sandbox");
  return Boolean(sandbox && sandbox.detail !== "no sandbox markers detected");
}

function checkCommand(
  name: string,
  command: string,
  args: string[],
  recommendation: string,
): CheckResult {
  const version = commandResponds(command, args);
  if (version !== null) {
    return { name, ok: true, detail: version || `${command} responded` };
  }
  return {
    name,
    ok: false,
    detail: `${command} did not respond`,
    recommendation,
  };
}

function checkWorkspaceChrome(): CheckResult {
  if (fs.existsSync(WORKSPACE_CHROME_BIN)) {
    const profileDetail = fs.existsSync(WORKSPACE_CHROME_PROFILE)
      ? `; profile at ${WORKSPACE_CHROME_PROFILE}`
      : "";
    return {
      name: "workspace-chrome",
      ok: true,
      detail: `${WORKSPACE_CHROME_BIN}${profileDetail}`,
    };
  }
  return {
    name: "workspace-chrome",
    ok: false,
    detail: `${WORKSPACE_CHROME_BIN} not found`,
    recommendation:
      "Run ./bin/feed-setup-sandbox to install Chrome under ./chrome-install.",
  };
}

export function redactRemoteUrl(remote: string): string {
  try {
    const parsed = new URL(remote);
    if (parsed.username) parsed.username = "redacted";
    if (parsed.password) parsed.password = "redacted";
    return parsed.toString();
  } catch {
    return remote;
  }
}

export function isSshRemote(remote: string): boolean {
  return remote.startsWith("git@") || /^ssh:\/\//i.test(remote);
}

const NON_PRIVATE_SSH_FILES = new Set([
  "allowed_signers",
  "authorized_keys",
  "authorized_principals",
  "config",
  "environment",
  "known_hosts",
  "known_hosts2",
  "known_hosts.old",
  "rc",
]);

export function isSshPrivateKeyFilename(filename: string): boolean {
  return (
    !filename.startsWith(".") &&
    !filename.endsWith(".pub") &&
    !filename.endsWith("-cert.pub") &&
    !NON_PRIVATE_SSH_FILES.has(filename) &&
    (/^id_/.test(filename) ||
      /(^|[-_])(rsa|dsa|ecdsa|ed25519|ed448)($|[-_])/i.test(filename))
  );
}

function hasSshPrivateKey(sshDir: string): boolean {
  try {
    return fs
      .readdirSync(sshDir, { withFileTypes: true })
      .some(
        (entry) =>
          (entry.isFile() || entry.isSymbolicLink()) &&
          isSshPrivateKeyFilename(entry.name),
      );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
      return false;
    }
    throw error;
  }
}

function hasSshAgentKey(): boolean {
  return (
    Boolean(process.env.SSH_AUTH_SOCK) &&
    commandResponds("ssh-add", ["-l"]) !== null
  );
}

function hasSshCredentials(sshDir: string): boolean {
  return hasSshAgentKey() || hasSshPrivateKey(sshDir);
}

function checkGitRemote(): CheckResult {
  const remote = commandResponds("git", [
    "-C",
    REPO_ROOT,
    "remote",
    "get-url",
    "origin",
  ]);
  if (remote === null) {
    return {
      name: "git-remote",
      ok: true,
      detail: "origin remote unavailable; skipped",
    };
  }
  const redactedRemote = redactRemoteUrl(remote);
  if (!isSshRemote(remote)) {
    return { name: "git-remote", ok: true, detail: redactedRemote };
  }
  const sshDir = path.join(os.homedir(), ".ssh");
  if (hasSshCredentials(sshDir))
    return { name: "git-remote", ok: true, detail: redactedRemote };
  return {
    name: "git-remote",
    ok: false,
    detail: `${redactedRemote}; no private key found in ${sshDir}`,
    recommendation:
      "Use gh auth plus an HTTPS remote in keyless sandboxes, or add an SSH key.",
  };
}

function checkSandboxDependencies(): CheckResult[] {
  return [
    checkCommand("pnpm", "pnpm", ["--version"], "Install pnpm before setup."),
    checkCommand(
      "uv",
      "uv",
      ["--version"],
      "Install uv, then run pnpm setup:yt-dlp for video sources.",
    ),
    checkCommand(
      "yt-dlp",
      "yt-dlp",
      ["--version"],
      "Run pnpm setup:yt-dlp before capturing video sources.",
    ),
    checkWorkspaceChrome(),
    checkGitRemote(),
  ];
}

function checkCic(): CheckResult {
  return {
    name: "cic",
    ok: true,
    detail: `CLI path available for sources: ${listCicSources().join(", ")}`,
    recommendation:
      "Use feed-capture-cic only when the Chrome connector/MCP tools are available in the host app; this CLI cannot verify the connector by itself.",
  };
}

export function recommendedBrowserConfig(
  results: CheckResult[],
): RecommendedBrowserConfig | null {
  const cdp = results.find(
    (result) => result.name.startsWith("cdp:") && result.ok,
  );
  if (cdp) {
    const match = cdp.recommendation?.match(
      /capture\.browser\.cdp to "([^"]+)"/,
    );
    return { cdp: match?.[1] ?? cdp.name.replace(/^cdp:/, "") };
  }
  if (results.find((result) => result.name === "agent-browser")?.ok) {
    return {};
  }
  return null;
}

export function applyBrowserConfigToPayload(
  payload: string,
  browser: RecommendedBrowserConfig,
): string {
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid config template");
  }
  const config = parsed as {
    user_preferences?: { sources?: unknown[] };
  };
  const sources = config.user_preferences?.sources;
  if (!Array.isArray(sources)) {
    throw new Error("Config template is missing user_preferences.sources");
  }

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      continue;
    }
    const entry = source as {
      capture?: { browser?: RecommendedBrowserConfig };
    };
    entry.capture = entry.capture || {};
    entry.capture.browser = { ...browser };
  }

  return `${JSON.stringify(config, null, 2)}\n`;
}

function maybeWriteConfig(
  results: CheckResult[],
  forceConfig: boolean,
): ConfigResult {
  if (fs.existsSync(DEFAULT_CONFIG_PATH) && !forceConfig) {
    return {
      status: "exists",
      detail: "config.json already exists; left unchanged.",
      path: DEFAULT_CONFIG_PATH,
    };
  }

  if (!fs.existsSync(EXAMPLE_CONFIG_PATH)) {
    return {
      status: "unavailable",
      detail: "config.json.example is missing; could not create config.json.",
    };
  }

  const browser = recommendedBrowserConfig(results);
  if (!browser) {
    return {
      status: "unavailable",
      detail:
        "No usable agent-browser or CDP path was detected; config.json was not changed.",
    };
  }

  const payload = applyBrowserConfigToPayload(
    fs.readFileSync(EXAMPLE_CONFIG_PATH, "utf8"),
    browser,
  );
  fs.writeFileSync(DEFAULT_CONFIG_PATH, payload);
  return {
    status: "created",
    detail:
      Object.keys(browser).length === 0
        ? "Created config.json using agent-browser auto-connect."
        : `Created config.json using CDP port ${browser.cdp}.`,
    path: DEFAULT_CONFIG_PATH,
  };
}

function printConfigResult(configResult: ConfigResult): void {
  console.log("");
  const status = configResult.status === "created" ? "OK" : "INFO";
  console.log(`${status} config: ${configResult.detail}`);
}

function printText(results: CheckResult[], configResult: ConfigResult): void {
  if (isCoworkEnvironment()) {
    console.log(
      "INFO cowork: Chrome is reaped at turn end; sign in and capture in the same turn, while the workspace profile on disk persists.",
    );
    console.log("");
  }
  for (const result of results) {
    const status = result.ok ? "OK" : "NO";
    console.log(`${status} ${result.name}: ${result.detail}`);
    if (result.recommendation) {
      console.log(`   ${result.recommendation}`);
    }
  }

  const agentBrowser = results.find(
    (result) => result.name === "agent-browser",
  );
  const cdp = results.find(
    (result) => result.name.startsWith("cdp:") && result.ok,
  );
  console.log("");
  if (cdp) {
    console.log(`Recommended capture path: Chrome CDP via ${cdp.name}.`);
  } else if (agentBrowser?.ok) {
    console.log("Recommended capture path: agent-browser auto-connect.");
  } else if (isSandbox(results)) {
    console.log(
      "Recommended capture path: workspace Chrome via CDP after sandbox setup.",
    );
  } else {
    console.log(
      "Recommended capture path: launch dedicated Chrome with --remote-debugging-port=9222, or use CiC if the host Chrome connector is available.",
    );
  }
  printConfigResult(configResult);
}

export async function main(): Promise<void> {
  const { json, cdpPorts, configure, forceConfig } = parseArgs(process.argv);
  const results = [
    checkAgentBrowser(),
    ...checkCdpPorts(cdpPorts),
    checkSandbox(),
    checkCic(),
  ];
  if (isSandbox(results)) {
    results.push(...checkSandboxDependencies());
  }
  const configResult = configure
    ? maybeWriteConfig(results, forceConfig)
    : {
        status: "skipped" as const,
        detail: "config write disabled by --no-config.",
      };
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ results, config: configResult }, null, 2)}\n`,
    );
  } else {
    printText(results, configResult);
  }
}
