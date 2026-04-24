#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { getCdpVersionUrl, readCdpVersionPayload } from "./browser.js";

const { listCicSources } = require("./cic/source-config.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CDP_PORTS = [9222, 9223, 9333];
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, "config.json.example");

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

type RecommendedBrowserConfig = Record<string, never> | { cdp: string };

function usage(): never {
  console.log(
    "Usage: feed-doctor [--json] [--no-config] [--write-config] [--cdp PORT] [--cdp PORT]...\n\nChecks capture avenues and creates config.json from config.json.example when missing.",
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

function checkAgentBrowser(): CheckResult {
  const command = fs.existsSync(localAgentBrowserBinary())
    ? localAgentBrowserBinary()
    : "agent-browser";
  try {
    const version = execFileSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    return {
      name: "agent-browser",
      ok: true,
      detail: version || `${command} responded`,
      recommendation:
        "Use browser: {} or omit capture.browser so feed-capture can auto-connect through agent-browser.",
    };
  } catch {
    return {
      name: "agent-browser",
      ok: false,
      detail: "agent-browser did not respond",
      recommendation: "Run pnpm install, then retry ./bin/feed-doctor.",
    };
  }
}

function getCdpVersion(port: number): CheckResult {
  const url = getCdpVersionUrl(String(port));
  try {
    const output = readCdpVersionPayload(url);
    const parsed = JSON.parse(output) as {
      Browser?: unknown;
      webSocketDebuggerUrl?: unknown;
    };
    if (typeof parsed.webSocketDebuggerUrl === "string") {
      return {
        name: `cdp:${port}`,
        ok: true,
        detail: String(parsed.Browser || "Chrome DevTools Protocol endpoint"),
        recommendation: `Set capture.browser.cdp to "${port}".`,
      };
    }
    return {
      name: `cdp:${port}`,
      ok: false,
      detail: `${url} responded but did not include webSocketDebuggerUrl`,
      recommendation:
        "Do not use this port for CDP capture; try agent-browser or launch dedicated Chrome with --remote-debugging-port.",
    };
  } catch {
    return {
      name: `cdp:${port}`,
      ok: false,
      detail: `${url} is not a usable CDP endpoint`,
    };
  }
}

function checkCdpPorts(ports: number[]): CheckResult[] {
  return ports.map((port) => getCdpVersion(port));
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
  if (results.find((result) => result.name === "agent-browser")?.ok) {
    return {};
  }
  const cdp = results.find(
    (result) => result.name.startsWith("cdp:") && result.ok,
  );
  if (!cdp) return null;
  return { cdp: cdp.name.replace(/^cdp:/, "") };
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
  if (agentBrowser?.ok) {
    console.log("Recommended capture path: agent-browser auto-connect.");
  } else if (cdp) {
    console.log(`Recommended capture path: Chrome CDP via ${cdp.name}.`);
  } else {
    console.log(
      "Recommended capture path: launch dedicated Chrome with --remote-debugging-port=9222, or use CiC if the host Chrome connector is available.",
    );
  }
  printConfigResult(configResult);
}

export async function main(): Promise<void> {
  const { json, cdpPorts, configure, forceConfig } = parseArgs(process.argv);
  const results = [checkAgentBrowser(), ...checkCdpPorts(cdpPorts), checkCic()];
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
