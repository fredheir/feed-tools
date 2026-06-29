#!/usr/bin/env node

import {
  DEFAULT_CDP_PORTS,
  type CheckResult,
  type ConfigResult,
  detectSandboxSignals,
  isSshPrivateKeyFilename,
  isSshRemote,
  recommendedBrowserConfig,
  redactRemoteUrl,
  runDoctor,
} from "./doctor-service.ts";

export {
  detectSandboxSignals,
  isSshPrivateKeyFilename,
  isSshRemote,
  recommendedBrowserConfig,
  redactRemoteUrl,
};

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

function isCoworkEnvironment(): boolean {
  return (
    Boolean(process.env.CLAUDE_CODE_IS_COWORK) ||
    !process.env.DBUS_SESSION_BUS_ADDRESS
  );
}

function printConfigResult(configResult: ConfigResult): void {
  console.log("");
  const status = configResult.status === "created" ? "OK" : "INFO";
  console.log(`${status} config: ${configResult.detail}`);
}

function printText(
  results: CheckResult[],
  configResult: ConfigResult,
  recommendedPath: string,
): void {
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

  console.log("");
  if (recommendedPath === "cdp") {
    const cdp = results.find(
      (result) => result.name.startsWith("cdp:") && result.ok,
    );
    console.log(`Recommended capture path: Chrome CDP via ${cdp?.name}.`);
  } else if (recommendedPath === "agent-browser") {
    console.log("Recommended capture path: agent-browser auto-connect.");
  } else if (recommendedPath === "workspace-chrome") {
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
  const doctor = runDoctor({ cdpPorts, configure, forceConfig });
  if (json) {
    process.stdout.write(`${JSON.stringify(doctor, null, 2)}\n`);
  } else {
    printText(doctor.results, doctor.config, doctor.recommendedPath);
  }
}
