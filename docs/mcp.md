# Feed Tools MCP

## Purpose

The MCP server is the preferred agent interface for feed-tools. It lets an agent call feed workflow tools directly instead of driving a browser through Claude in Chrome or Cowork browser tools.

The normal path is:

```text
agent / MCP host
  -> feed-tools MCP server
     -> feed-tools capture, curation, classification, and render services
        -> local Chrome profile over CDP
        -> sqlite, JSON snapshots, feed.json, feed.html
```

Claude in Chrome remains a fallback for hosted environments where the user's authenticated browser is available through a Chrome connector but no usable CDP browser is available.

## Goals

- expose feed workflow operations as MCP tools
- keep browser operation inside feed-tools code
- reuse the existing CDP and `agent-browser` capture path
- keep the user's authenticated Chrome profile local
- return compact structured results and file paths to the agent
- avoid Cowork download mounts, console-message transport, and browser-extension settings

## Non-goals

- no generic browser-control MCP API
- no replacement of source extractor code
- no remote hosted feed service in the first cut
- no dependency on Claude in Chrome for the normal path
- no large feed document payloads by default

## Local MCP model

The first implementation should use a local stdio MCP server. The MCP host starts a local command and communicates with it over stdin/stdout. Because stdout is protocol traffic, the MCP server must not write normal logs to stdout. Logs should go to stderr or files, and child-process stdout should be captured and returned as tool data.

Example MCP host configuration for a checked-out repo:

```json
{
  "mcpServers": {
    "feed-tools": {
      "command": "node",
      "args": ["/absolute/path/to/feed-tools/bin/feed-mcp"],
      "env": {
        "FEED_TOOLS_CDP": "9223",
        "FEED_TOOLS_CHROME_PROFILE": "/absolute/path/to/feed-tools/chrome-profile"
      }
    }
  }
}
```

A packaged version can later use `npx`:

```json
{
  "mcpServers": {
    "feed-tools": {
      "command": "npx",
      "args": ["-y", "@markolo/feed-tools-mcp"],
      "env": {
        "FEED_TOOLS_WORKDIR": "/absolute/path/to/feed-tools",
        "FEED_TOOLS_CDP": "9223"
      }
    }
  }
}
```

## Environment variables

The MCP server should recognise these variables:

- `FEED_TOOLS_WORKDIR`: repository/workspace root. Defaults to the repo containing `bin/feed-mcp`.
- `FEED_TOOLS_CONFIG`: explicit config path. Existing config loading already supports this.
- `FEED_TOOLS_CDP`: default CDP endpoint or port. Prefer `9223` over `9222`.
- `FEED_TOOLS_CHROME_BIN`: explicit Chrome/Chromium binary.
- `FEED_TOOLS_CHROME_PROFILE`: dedicated Chrome profile path.

## Chrome and CDP

The MCP path should use a dedicated Chrome profile and CDP port. It should not attach to the user's default browser profile unless explicitly configured.

Default port: `9223`.

Chrome launch shape:

```sh
google-chrome \
  --remote-debugging-port=9223 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/absolute/path/to/feed-tools/chrome-profile \
  --no-first-run \
  --no-default-browser-check \
  --disable-features=LockProfileCookieDatabase
```

In sandboxed environments, add `--no-sandbox` where required.

The MCP server must validate CDP by requesting `/json/version` and checking for a `webSocketDebuggerUrl`. A port that responds with HTML, 404, or JSON without `webSocketDebuggerUrl` is not a usable CDP endpoint.

## Tool surface

### `feed_doctor`

Checks local readiness and returns structured next actions.

Input:

```ts
{
  cdp_ports?: number[];
  write_config?: boolean;
  config_path?: string;
}
```

Output:

```ts
{
  ok: boolean;
  recommended_path: "cdp" | "agent-browser" | "workspace-chrome" | "cic-fallback" | "none";
  checks: Array<{
    name: string;
    ok: boolean;
    detail: string;
    recommendation?: string;
  }>;
  config?: {
    status: "exists" | "created" | "skipped" | "unavailable";
    path?: string;
    detail: string;
  };
  next_actions: string[];
}
```

### `feed_browser_start`

Starts or reuses a dedicated Chrome CDP browser.

Input:

```ts
{
  cdp_port?: number;
  profile_dir?: string;
  chrome_bin?: string;
  urls?: string[];
  reuse_existing?: boolean;
  no_sandbox?: boolean;
}
```

Output:

```ts
{
  ok: boolean;
  cdp: string;
  profile_dir: string;
  chrome_bin: string;
  log_path: string;
  launched: boolean;
  pid?: number;
  version?: string;
}
```

### `feed_browser_status`

Checks whether a CDP endpoint is usable.

Input:

```ts
{
  cdp?: string;
}
```

Output:

```ts
{
  ok: boolean;
  cdp: string;
  version_url?: string;
  browser?: string;
  web_socket_debugger_url_present: boolean;
  detail: string;
}
```

### `feed_signin_open`

Opens source login/feed pages in the dedicated Chrome profile and returns immediately.

Input:

```ts
{
  sources: FeedSourceName[];
  cdp_port?: number;
  profile_dir?: string;
  reuse_existing?: boolean;
}
```

Output:

```ts
{
  ok: boolean;
  cdp: string;
  profile_dir: string;
  opened_urls: Record<FeedSourceName, string>;
  auth_status: Record<FeedSourceName, boolean>;
  instructions: string;
}
```

### `feed_signin_status`

Checks source-specific auth cookies in the Chrome profile.

Input:

```ts
{
  sources?: FeedSourceName[];
  profile_dir?: string;
}
```

Output:

```ts
{
  profile_dir: string;
  status: Record<FeedSourceName, boolean>;
  cookie_stores_found: number;
  missing: FeedSourceName[];
}
```

### `feed_config_read`

Returns the active config and resolved path.

### `feed_config_write`

Creates or updates `config.json` from structured source, browser, render, curation, and summary preferences.

### `feed_capture`

Captures one or more sources through the existing source adapters.

Input:

```ts
{
  sources: FeedSourceName[];
  limit?: number;
  assets_dir?: string;
  save_dir?: string;
  browser?: FeedBrowserConfig;
  require_auth?: boolean;
  include_document?: boolean;
}
```

Output:

```ts
{
  ok: boolean;
  source_counts: Record<FeedSourceName, number>;
  captured_at: string;
  save_dir: string;
  assets_dir: string;
  sqlite_path: string;
  latest_paths: Record<FeedSourceName, string>;
  current_paths: Record<FeedSourceName, string>;
  requires_classification: boolean;
  document?: FeedDocument;
}
```

### `feed_curate`

Exports a sqlite-backed workset and row listing. Classification-required state should be represented as data, not as a failed MCP call.

### `feed_classify`

Writes category assignments back into sqlite.

### `feed_render`

Renders `feed.html`. Default `open` should be false for MCP.

### `feed_open`

Opens a local file or URL in the controlled browser.

### `feed_pipeline`

Convenience wrapper for capture plus curate. It should stop before render when classification is required.

## Error model

Tool failures should use this shape:

```ts
{
  ok: false;
  error: {
    code:
      | "missing_dependency"
      | "cdp_unavailable"
      | "cdp_invalid"
      | "chrome_not_found"
      | "chrome_profile_locked"
      | "login_required"
      | "capture_empty"
      | "classification_required"
      | "config_missing"
      | "source_unsupported"
      | "tool_timeout"
      | "unexpected";
    message: string;
    detail?: string;
    next_actions: string[];
  };
}
```

`classification_required` is not a terminal failure. The agent should classify rows and continue.

## Implementation phases

1. Add MCP docs and agent runbook.
2. Extract doctor, browser, and sign-in services from CLIs.
3. Add the MCP server with status/browser/sign-in/config tools.
4. Extract capture, curate, classify, and render services.
5. Add pipeline tools and structured row output.
6. Rework README and AGENTS so MCP/CDP is primary and CiC is fallback.
7. Package the MCP server for easier install.
