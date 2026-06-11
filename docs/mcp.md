# Feed Tools MCP

## Purpose

The MCP server is the preferred setup and browser-control interface for feed-tools. It lets an agent inspect local readiness, manage a dedicated CDP browser profile, handle sign-in checks, and create config without driving a browser through Claude in Chrome or Cowork browser tools.

The normal path is:

```text
agent / MCP host
  -> feed-tools MCP server
     -> feed-tools setup, browser, sign-in, and config services
        -> local Chrome profile over CDP
     -> feed-tools CLI commands
        -> capture, curation, classification, render
        -> sqlite, JSON snapshots, feed.json, feed.html
```

The runnable entrypoint is `bin/feed-mcp`. Use `pnpm mcp:config` to print a copy-paste MCP host configuration for a local checkout.

Claude in Chrome remains a fallback for hosted environments where the user's signed-in browser is available through a Chrome connector but no usable CDP browser is available.

## Goals

- expose setup, browser, sign-in, and config operations as MCP tools
- keep browser operation inside feed-tools code
- reuse the existing CDP and `agent-browser` capture path
- keep the user's signed-in Chrome profile local
- return compact structured setup and auth results to the agent
- avoid Cowork download mounts, console-message transport, and browser-extension settings

## Non-goals

- no generic browser-control MCP API
- no replacement of source extractor code
- no remote hosted feed service in the first cut
- no dependency on Claude in Chrome for the normal path
- no capture, curate, classify, render, or pipeline MCP tools yet; use the existing CLI commands for the feed workflow

## Local MCP model

The implementation uses a local stdio MCP server. The MCP host starts a local command and communicates with it over stdin/stdout. Because stdout is protocol traffic, the MCP server must not write normal logs to stdout. Logs should go to stderr or files, and child-process stdout should be captured and returned as tool data.

MCP host configuration for a checked-out repo:

```json
{
  "mcpServers": {
    "feed-tools": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/absolute/path/to/feed-tools/bin/feed-mcp"
      ],
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

Current implemented tools:

### `feed_doctor`

Checks local readiness and returns structured next actions.

### `feed_browser_start`

Starts or reuses a dedicated Chrome CDP browser.

### `feed_browser_status`

Checks whether a CDP endpoint is usable.

### `feed_signin_open`

Opens source login/feed pages in the dedicated Chrome profile and returns immediately.

### `feed_signin_status`

Checks source-specific auth cookies in the Chrome profile.

### `feed_config_read`

Returns the active config and resolved path.

### `feed_config_write`

Creates or updates `config.json` from structured source, browser, render, curation, and summary preferences.

## Config helper

Run this from the repository root to print a local MCP host configuration:

```sh
pnpm mcp:config
```

Useful options:

```sh
pnpm mcp:config -- --client codex --cdp 9223 --profile ./chrome-profile
```

Capture, curation, classification, and rendering remain CLI commands:

```sh
./bin/feed-capture
./bin/feed-curate
./bin/feed-classify
./bin/feed-render
```

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
      | "config_missing"
      | "unexpected";
    message: string;
    detail?: string;
    next_actions: string[];
  };
}
```

## Implementation phases

1. Add MCP docs and agent runbook.
2. Extract doctor, browser, and sign-in services from CLIs.
3. Add the MCP server with status/browser/sign-in/config tools.
4. Add a config helper for MCP host setup.
5. Optional future work: extract capture, curate, classify, and render services.
6. Optional future work: add pipeline tools and structured row output.
7. Optional future work: package the MCP server for easier install.
