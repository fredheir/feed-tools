import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getBrowserStatus } from "./browser-status.ts";
import { listCicSources } from "./cic/source-config.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const WORKDIR = path.resolve(process.env.FEED_TOOLS_WORKDIR || PACKAGE_ROOT);
const DEFAULT_CONFIG_PATH = path.join(WORKDIR, "config.json");
const WORKDIR_CONFIG_EXAMPLE_PATH = path.join(WORKDIR, "config.json.example");
const PACKAGE_CONFIG_EXAMPLE_PATH = path.join(
  PACKAGE_ROOT,
  "config.json.example",
);
const WORKSPACE_CHROME_BIN = path.join(
  WORKDIR,
  "chrome-install",
  "opt",
  "google",
  "chrome",
  "google-chrome",
);

export const DEFAULT_CDP_PORTS = [9222, 9223, 9333];

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  recommendation?: string;
}

export interface ConfigResult {
  status: "created" | "exists" | "skipped" | "unavailable";
  detail: string;
  path?: string;
}

export interface SandboxSignal {
  name: string;
  detail: string;
}

export type RecommendedBrowserConfig = Record<string, never> | { cdp: string };

export interface DoctorOptions {
  cdpPorts?: number[];
  configure?: boolean;
  forceConfig?: boolean;
  configPath?: string;
}

export interface DoctorResult {
  results: CheckResult[];
  config: ConfigResult;
  recommendedPath:
    | "cdp"
    | "agent-browser"
    | "workspace-chrome"
    | "cic-fallback"
    | "none";
  nextActions: string[];
}

function commandResponds(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function localAgentBrowserBinary(): string {
  return path.join(
    PACKAGE_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agent-browser.cmd" : "agent-browser",
  );
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

function checkCdpPort(port: number): CheckResult {
  const status = getBrowserStatus(String(port));
  if (status.ok) {
    return {
      name: `cdp:${port}`,
      ok: true,
      detail: status.detail,
      recommendation: `Set capture.browser.cdp to "${status.cdp}".`,
    };
  }
  return {
    name: `cdp:${port}`,
    ok: false,
    detail: status.detail,
    recommendation: status.detail.includes("webSocketDebuggerUrl")
      ? "Do not use this port for CDP capture; try agent-browser or launch dedicated Chrome with --remote-debugging-port."
      : undefined,
  };
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
  if (/\/sessions\/[^/]+\/mnt\//.test(WORKDIR)) {
    signals.push({
      name: "session-mount",
      detail: "repo is under an ephemeral session mount",
    });
  }
  return signals;
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

function checkWorkspaceChrome(): CheckResult {
  if (fs.existsSync(WORKSPACE_CHROME_BIN)) {
    return {
      name: "workspace-chrome",
      ok: true,
      detail: WORKSPACE_CHROME_BIN,
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
  configPath = DEFAULT_CONFIG_PATH,
): ConfigResult {
  const targetConfigPath = path.resolve(configPath);
  if (fs.existsSync(targetConfigPath) && !forceConfig) {
    return {
      status: "exists",
      detail: "config.json already exists; left unchanged.",
      path: targetConfigPath,
    };
  }
  const targetExamplePath = path.join(
    path.dirname(targetConfigPath),
    "config.json.example",
  );
  const examplePath = fs.existsSync(WORKDIR_CONFIG_EXAMPLE_PATH)
    ? WORKDIR_CONFIG_EXAMPLE_PATH
    : fs.existsSync(targetExamplePath)
      ? targetExamplePath
      : PACKAGE_CONFIG_EXAMPLE_PATH;
  if (!fs.existsSync(examplePath)) {
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
    fs.readFileSync(examplePath, "utf8"),
    browser,
  );
  fs.mkdirSync(path.dirname(targetConfigPath), { recursive: true });
  fs.writeFileSync(targetConfigPath, payload);
  return {
    status: "created",
    detail:
      Object.keys(browser).length === 0
        ? "Created config.json using agent-browser auto-connect."
        : `Created config.json using CDP port ${browser.cdp}.`,
    path: targetConfigPath,
  };
}

function recommendedPath(
  results: CheckResult[],
): DoctorResult["recommendedPath"] {
  if (results.find((result) => result.name.startsWith("cdp:") && result.ok)) {
    return "cdp";
  }
  if (results.find((result) => result.name === "agent-browser")?.ok) {
    return "agent-browser";
  }
  if (isSandbox(results)) return "workspace-chrome";
  if (results.find((result) => result.name === "cic")?.ok)
    return "cic-fallback";
  return "none";
}

function nextActions(results: CheckResult[], config: ConfigResult): string[] {
  const actions = results
    .filter((result) => !result.ok && result.recommendation)
    .map((result) => result.recommendation as string);
  if (config.status === "unavailable") actions.push(config.detail);
  if (actions.length > 0) return actions;
  const path = recommendedPath(results);
  if (path === "cdp") {
    return ["Set capture.browser.cdp to the detected CDP endpoint."];
  }
  if (path === "agent-browser")
    return ["Use the existing agent-browser capture path."];
  if (path === "workspace-chrome") {
    return [
      "Run ./bin/feed-setup-sandbox, launch workspace Chrome, then rerun doctor.",
    ];
  }
  if (path === "cic-fallback")
    return ["Use CiC only if MCP/CDP remains unavailable."];
  return ["Install dependencies and launch a dedicated Chrome CDP profile."];
}

export function runDoctor(options: DoctorOptions = {}): DoctorResult {
  const {
    cdpPorts = DEFAULT_CDP_PORTS,
    configure = true,
    forceConfig = false,
    configPath = DEFAULT_CONFIG_PATH,
  } = options;
  const results = [
    checkAgentBrowser(),
    ...cdpPorts.map((port) => checkCdpPort(port)),
    checkSandbox(),
    checkCic(),
  ];
  if (isSandbox(results)) {
    results.push(checkWorkspaceChrome());
  }
  const config = configure
    ? maybeWriteConfig(results, forceConfig, configPath)
    : {
        status: "skipped" as const,
        detail: "config write disabled.",
      };
  return {
    results,
    config,
    recommendedPath: recommendedPath(results),
    nextActions: nextActions(results, config),
  };
}
