#!/usr/bin/env node
import {
  closeChrome,
  DEFAULT_CDP_PORT,
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  launchChrome,
  listSupportedSigninSources,
  runSigninWait,
  waitForCdp,
} from "./signin-service.ts";
import { isSupportedSource } from "./source-catalog.ts";
import type { FeedSourceName } from "./types.ts";

interface ParsedArgs {
  sources: FeedSourceName[];
  cdpPort: string;
  intervalMs: number;
  timeoutMs: number;
}

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
      `Provide at least one source: ${listSupportedSigninSources().join(", ")}`,
    );
  }
  return { sources, cdpPort, intervalMs, timeoutMs };
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const child = launchChrome({ sources: args.sources, cdpPort: args.cdpPort });
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    closeChrome(child);
  });
  process.on("SIGTERM", () => {
    interrupted = true;
    closeChrome(child);
  });

  console.log(
    `Chrome launched on CDP port ${args.cdpPort}; log: ${child.logPath}`,
  );
  console.log(`Profile: ${child.profileDir}`);
  try {
    await waitForCdp(args.cdpPort, child);
    console.log(
      "Sign in in the opened browser window. Waiting for auth cookies...",
    );
    await runSigninWait({
      sources: args.sources,
      intervalMs: args.intervalMs,
      timeoutMs: args.timeoutMs,
      child,
      isInterrupted: () => interrupted,
      onStatus: (status) => {
        console.log(`${new Date().toISOString()} ${status.text}`);
      },
    });
    console.log(
      "Sign-in auth cookies detected. Closing Chrome to flush profile state.",
    );
  } finally {
    closeChrome(child);
  }
}
