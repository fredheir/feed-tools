# MCP Agent Runbook

This runbook covers the implemented local feed-tools MCP setup/status server. Use MCP for environment checks, dedicated browser launch, sign-in status, and config management. Use the existing CLI commands for capture, curation, classification, and rendering.

## Rules

- Use feed-tools MCP tools for setup, browser launch/status, sign-in, and config.
- Use `feed-capture`, `feed-curate`, `feed-classify`, and `feed-render` for the feed workflow.
- Do not drive the browser through Claude in Chrome, Cowork browser tools, or generic browser automation unless the MCP/CDP path is unavailable.
- Do not ask the user to perform shell steps that the agent can perform itself.
- Do ask the user to complete platform login in the opened Chrome profile.
- Keep full feed documents on disk unless the user explicitly needs the JSON payload.
- Treat classification-required CLI output as a normal workflow step, not a fatal error.

## Expected architecture

```text
agent
     -> feed-tools MCP tools
     -> local setup/browser/sign-in/config services
        -> local Chrome profile over CDP
  -> feed-tools CLI commands
     -> sqlite + feed.json + feed.html
```

Claude in Chrome is fallback-only. Prefer MCP/CDP for browser setup and auth.

## Initial setup

### 1. Check the environment

Call:

```text
feed_doctor
```

If it returns a usable CDP path, continue.

If it reports that Chrome is missing, install or locate Chrome before continuing.

If it reports that dependencies are missing, install them according to the repository docs, then call `feed_doctor` again.

If it reports that `config.json` is missing, create one with `feed_config_write` after asking or inferring the user's source and curation preferences.

### 2. Start or validate Chrome

Call:

```text
feed_browser_status
```

Use the configured CDP value, or default to port `9223`.

If CDP is not available, call:

```text
feed_browser_start
```

Use a dedicated profile. Do not use the user's default Chrome profile unless explicitly requested.

Preferred defaults:

```json
{
  "cdp_port": 9223,
  "profile_dir": "./chrome-profile",
  "reuse_existing": true
}
```

After launch, call `feed_browser_status` again.

### 3. Configure feed-tools

Read the current config:

```text
feed_config_read
```

If no real config exists, create one:

```text
feed_config_write
```

Prefer this browser block for each enabled source:

```json
{
  "cdp": "9223"
}
```

When `cdp` is set, do not also set `headed` or `autoConnect`.

## Authentication

Call `feed_signin_status` for the sources you intend to capture. For missing sources, call `feed_signin_open`, ask the user to complete login in the opened Chrome window, then poll `feed_signin_status` until the required sources are ready.

## Capture flow

Run:

```sh
./bin/feed-capture x 30
```

For multiple sources, either pass all sources at once or capture one source at a time if the host has short command timeouts.

If capture reports a login issue, return to the authentication flow. If capture is empty, report the source and relevant next actions. Do not render an empty feed.

## Curation flow

Run:

```sh
./bin/feed-curate --sources x --limit 80 --exclude-completed
```

For a topic feed, pass a keyword battery rather than one term.

## Classification flow

If `feed-curate` reports that classification is required, inspect the returned rows and assign categories deliberately.

Run:

```sh
./bin/feed-classify --category "News:1-4,8" --category "Coding:5-7" --category "Other:9-12"
```

After classification, run `feed-curate` again. Continue only once it returns a normal row listing.

## Render flow

Run:

```sh
./bin/feed-render --tab --no-open
```

If the user asked for a summary, pass it explicitly.

Return the HTML path to the user. If the user wants the file opened in a browser, use the local browser flow available in the current environment.

## Full normal workflow

```text
feed_doctor
feed_browser_status
feed_browser_start          # only if CDP is unavailable
feed_config_read
feed_config_write           # only if config is missing or wrong
feed_signin_status
feed_signin_open            # only for missing source auth
feed_signin_status          # repeat until ready
./bin/feed-capture
./bin/feed-curate
./bin/feed-classify         # only if required
./bin/feed-curate           # repeat after classification
./bin/feed-render
```

## Failure handling

- `cdp_unavailable`: start Chrome with `feed_browser_start`, or choose another CDP port.
- `cdp_invalid`: the port is occupied by something that is not Chrome DevTools Protocol. Try `9223` or another free port.
- `chrome_not_found`: install Chrome/Chromium or set `FEED_TOOLS_CHROME_BIN`.
- `chrome_profile_locked`: use a dedicated feed-tools profile or close the Chrome process that owns the profile.
- `login_required`: call `feed_signin_open`, ask the user to log in, then poll `feed_signin_status`.
- `capture_empty`: do not render. Check auth, selectors, blocked page state, and source-specific access.
- `classification_required`: classify returned rows with `feed-classify`, then rerun `feed-curate`.
- `tool_timeout`: retry CLI commands per source with a lower limit.

## When to use Claude in Chrome

Use Claude in Chrome only when all are true:

- the MCP/CDP path is unavailable
- the host has a working Chrome connector
- the user's signed-in browser is only reachable through that connector

When using Claude in Chrome, follow the existing CiC documentation. Do not mix CiC with the MCP/CDP normal path in the same run unless deliberately recovering from a CDP failure.
