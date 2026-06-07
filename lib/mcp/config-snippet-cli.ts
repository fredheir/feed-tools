#!/usr/bin/env node
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const STRIP_TYPES_FLAG = "--experimental-strip-types";

interface ParsedArgs {
  client: string;
  workdir: string;
  cdp: string;
  profile: string;
}

function usage(): never {
  console.log(
    [
      "Usage: feed-mcp-config [--client NAME] [--workdir DIR] [--cdp PORT] [--profile DIR]",
      "",
      "Prints a copy-paste MCP server configuration for feed-tools.",
    ].join("\n"),
  );
  process.exit(0);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    client: "generic",
    workdir: REPO_ROOT,
    cdp: process.env.FEED_TOOLS_CDP || "9223",
    profile:
      process.env.FEED_TOOLS_CHROME_PROFILE ||
      path.join(REPO_ROOT, "chrome-profile"),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") usage();
    if (arg === "--client") {
      args.client = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--workdir") {
      args.workdir = path.resolve(requireValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--cdp") {
      args.cdp = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      args.profile = path.resolve(requireValue(argv, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function serverConfig(args: ParsedArgs): Record<string, unknown> {
  return {
    command: process.execPath,
    args: [STRIP_TYPES_FLAG, path.join(args.workdir, "bin", "feed-mcp")],
    env: {
      FEED_TOOLS_WORKDIR: args.workdir,
      FEED_TOOLS_CDP: args.cdp,
      FEED_TOOLS_CHROME_PROFILE: args.profile,
    },
  };
}

function printConfig(args: ParsedArgs): void {
  const config = {
    mcpServers: {
      "feed-tools": serverConfig(args),
    },
  };

  if (args.client !== "generic") {
    process.stderr.write(
      `# ${args.client}: paste the JSON below into the client's MCP server configuration.\n`,
    );
  }
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
}

function main(): void {
  printConfig(parseArgs(process.argv));
}

if (path.basename(process.argv[1] || "") === "feed-mcp-config") {
  main();
}
