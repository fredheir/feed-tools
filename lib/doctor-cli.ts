#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";

const { listCicSources } = require("./cic/source-config.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CDP_PORTS = [9222, 9223, 9333];

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  recommendation?: string;
}

function usage(): never {
  console.log(
    "Usage: feed-doctor [--json] [--cdp PORT] [--cdp PORT]...\n\nChecks capture avenues: agent-browser, Chrome CDP, and CiC readiness notes.",
  );
  process.exit(0);
}

function parseArgs(argv: string[]): { json: boolean; cdpPorts: number[] } {
  let json = false;
  const cdpPorts: number[] = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") usage();
    if (arg === "--json") {
      json = true;
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
  const url = `http://127.0.0.1:${port}/json/version`;
  try {
    const output = execFileSync("curl", ["-sf", "--max-time", "2", url], {
      encoding: "utf8",
      timeout: 2500,
    });
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

async function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port,
      timeout: 1000,
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function checkCdpPorts(ports: number[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const port of ports) {
    if (await canConnect(port)) {
      results.push(getCdpVersion(port));
    } else {
      results.push({
        name: `cdp:${port}`,
        ok: false,
        detail: `127.0.0.1:${port} is not listening`,
      });
    }
  }
  return results;
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

function printText(results: CheckResult[]): void {
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
}

(async () => {
  const { json, cdpPorts } = parseArgs(process.argv);
  const results = [
    checkAgentBrowser(),
    ...(await checkCdpPorts(cdpPorts)),
    checkCic(),
  ];
  if (json) {
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  } else {
    printText(results);
  }
})();
