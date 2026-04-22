import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  execFileSync,
  spawnSync,
  type SpawnSyncReturns,
} from "node:child_process";
import { fileURLToPath } from "node:url";

import type { RawFeedConfig } from "../../lib/types.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(dirname, "../..");
const fixturesRoot = path.resolve(dirname, "..", "fixtures");

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends JsonLike | undefined
      ? T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};

export function readFixture(...segments: string[]): string {
  return fs.readFileSync(path.join(fixturesRoot, ...segments), "utf8");
}

export function runCli(
  scriptPath: string,
  args: string[],
  configPath: string,
): string {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: withConfigEnv(configPath),
  });
}

export function spawnCli(
  scriptPath: string,
  args: string[],
  configPath: string,
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: withConfigEnv(configPath),
  });
}

export function writeTestConfig(
  _repoDir?: string,
  overrides: DeepPartial<RawFeedConfig> = {},
): string {
  const configDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "feed-tools-config-"),
  );
  const configPath = path.join(configDir, "config.json");
  const {
    user_preferences: userPreferencesOverrides = {},
    ...topLevelOverrides
  } = overrides;
  const config = {
    ...topLevelOverrides,
    user_preferences: {
      sources: [
        {
          name: "x",
          enabled: true,
          default: true,
          capture: {
            save_dir: "./var/feed-archive",
            default_limit: 12,
            browser: {},
          },
        },
        {
          name: "bluesky",
          enabled: true,
          capture: {
            save_dir: "./var/feed-archive",
            default_limit: 12,
            browser: {},
          },
        },
        {
          name: "facebook",
          enabled: true,
          capture: {
            save_dir: "./var/feed-archive",
            default_limit: 12,
            browser: {},
          },
        },
        {
          name: "linkedin",
          enabled: true,
          capture: {
            save_dir: "./var/feed-archive",
            default_limit: 12,
            browser: {},
          },
        },
        {
          name: "youtube",
          enabled: true,
          capture: {
            save_dir: "./var/feed-archive",
            default_limit: 12,
            browser: {},
          },
        },
      ],
      curation: {
        preferred_categories: [
          "Coding",
          "Politics",
          "Finance",
          "Friends and Family",
        ],
        fallback_category: "Other",
      },
      render: {
        show_summary: true,
        show_tabs: false,
      },
      summary: {
        default_style: "",
        populate_on_request_only: true,
        custom_instructions: "",
      },
      ...userPreferencesOverrides,
    },
  } satisfies DeepPartial<RawFeedConfig>;

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

export function withConfigEnv(configPath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FEED_TOOLS_CONFIG: configPath,
  };
}
