import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WORKDIR = path.resolve(
  process.env.FEED_TOOLS_WORKDIR || path.resolve(import.meta.dirname, ".."),
);
const WORKSPACE_CHROME_BIN = path.join(
  WORKDIR,
  "chrome-install",
  "opt",
  "google",
  "chrome",
  "google-chrome",
);

export const MINIMUM_CHROME_VERSION = "156.0.8078.73";

export function assertSupportedChromeVersion(banner: string): void {
  const version = banner.match(
    /(?:Chrome|Chromium)(?: for Testing)?[ /](\d+\.\d+\.\d+\.\d+)/,
  )?.[1];
  const parts = version?.split(".").map(Number);
  const minimum = MINIMUM_CHROME_VERSION.split(".").map(Number);
  if (parts) {
    for (let index = 0; index < minimum.length; index += 1) {
      if (parts[index] > minimum[index]) return;
      if (parts[index] < minimum[index]) break;
      if (index === minimum.length - 1) return;
    }
  }
  throw new Error(
    `Chrome ${MINIMUM_CHROME_VERSION} or newer is required; found ${banner}. Update Chrome before browsing.`,
  );
}

export function assertChromeBinaryVersion(chromeBin: string): void {
  assertSupportedChromeVersion(
    execFileSync(chromeBin, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim(),
  );
}

export function assertSandboxArgs(args: string[]): void {
  if (
    args.some((arg) =>
      /^--(?:no-sandbox|disable-setuid-sandbox|disable-seccomp-filter-sandbox|single-process)(?:=|$)/.test(
        arg,
      ),
    )
  ) {
    throw new Error(
      "Feed browsing requires Chrome sandboxing; remove sandbox-disabling browser arguments.",
    );
  }
}

function commandExists(command: string): boolean {
  return (
    spawnSync("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore",
    }).status === 0
  );
}

function commandPath(command: string): string | null {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function isExecutableFile(candidate: string): boolean {
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  return Boolean(stat?.isFile() && (stat.mode & 0o111) !== 0);
}

export function resolveChromeBin(explicit?: string | null): string | null {
  if (explicit) {
    const candidate = path.resolve(explicit);
    return isExecutableFile(candidate) ? candidate : null;
  }
  if (process.env.FEED_TOOLS_CHROME_BIN) {
    const candidate = path.resolve(process.env.FEED_TOOLS_CHROME_BIN);
    return isExecutableFile(candidate) ? candidate : null;
  }
  for (const command of [
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ]) {
    if (commandExists(command)) return commandPath(command);
  }
  const macChrome =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (isExecutableFile(macChrome)) return macChrome;
  return isExecutableFile(WORKSPACE_CHROME_BIN) ? WORKSPACE_CHROME_BIN : null;
}
