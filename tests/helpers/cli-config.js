import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../..");

export function writeTestConfig(directory, overrides = {}) {
  const configDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "feed-tools-config-"),
  );
  const configPath = path.join(configDir, "config.json");
  const config = {
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
      ...overrides.user_preferences,
    },
    ...overrides,
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

export function withConfigEnv(configPath) {
  return {
    ...process.env,
    FEED_TOOLS_CONFIG: configPath,
  };
}
