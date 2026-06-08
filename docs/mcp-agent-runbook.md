# MCP Agent Runbook

Use this runbook when an agent is setting up or operating feed-tools through the local MCP server.

## Rules

- Use the feed-tools MCP tools for setup, capture, curation, classification, and rendering.
- Do not drive the browser through Claude in Chrome, Cowork browser tools, or generic browser automation unless the MCP/CDP path is unavailable.
- Do not ask the user to perform shell steps that the agent can perform itself.
- Do ask the user to complete platform login, 2FA, or anti-bot checks in the opened Chrome profile.
- Keep full feed documents on disk unless the user explicitly needs the JSON payload.
- Treat classification-required state as a normal workflow step, not a fatal error.

## Expected architecture

```text
agent
  -> feed-tools MCP tools
     -> local feed-tools services
        -> local Chrome profile over CDP
        -> sqlite + feed.json + feed.html
```

Claude in Chrome is fallback-only. Prefer MCP/CDP.

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

### 1. Check auth status

Call:

```text
feed_signin_status
```

Pass the sources you intend to capture.

### 2. Open login pages

For missing sources, call:

```text
feed_signin_open
```

Then tell the user to complete login in the opened Chrome window.

Do not try to automate passwords, 2FA, passkeys, or anti-bot checks.

### 3. Poll until ready

Call:

```text
feed_signin_status
```

Repeat until the required sources are authenticated or the user says to continue without them.

If a source remains unauthenticated, either skip it or continue knowing capture may fail.

## Capture flow

Call:

```text
feed_capture
```

Recommended input:

```json
{
  "sources": ["x"],
  "limit": 30,
  "require_auth": true,
  "include_document": false
}
```

For multiple sources, either pass all sources at once or capture one source at a time if the host has short tool timeouts.

Expected result:

- item counts per source
- sqlite path
- latest/current snapshot paths
- whether classification is required

If the result is `login_required`, return to the authentication flow.

If the result is `capture_empty`, report the source and relevant next actions. Do not render an empty feed.

## Curation flow

Call:

```text
feed_curate
```

`feed_curate` returns compact parsed rows by default. Use `include_stdout: true` only when you need the raw CLI listing for debugging.

Common inputs:

```json
{
  "sources": ["x"],
  "limit": 80,
  "exclude_completed": true
}
```

For a topic feed, pass a keyword battery:

```json
{
  "matches": ["ukraine", "russia", "nato", "sanctions"]
}
```

Use several adjacent terms. Do not rely on one keyword when the topic has obvious synonyms or related names.

## Classification flow

If `feed_curate` returns `requires_classification: true`, inspect the returned rows and assign categories deliberately.

Call:

```text
feed_classify
```

Example:

```json
{
  "assignments": [
    { "category": "Politics", "rows": "1-4,8" },
    { "category": "Coding", "rows": "5-7" },
    { "category": "Other", "rows": "9-12" }
  ]
}
```

After classification, call `feed_curate` again. Continue only once it returns a normal row listing.

## Render flow

Call:

```text
feed_render
```

Recommended default:

```json
{
  "tab": true,
  "open": false
}
```

If the user asked for a summary, pass it explicitly:

```json
{
  "summary": "...",
  "tab": true,
  "open": false
}
```

Return the `html_path` to the user.

## One-shot pipeline flow

When auth and config are already ready, prefer:

```text
feed_pipeline_render
```

Use it for the normal capture -> curate -> render path. It stops before render if classification is required and returns parsed rows for classification. After calling `feed_classify`, call `feed_pipeline_render` with `capture: false` or call `feed_curate` then `feed_render` if you do not want to capture again.

If the user wants the file opened in the controlled browser, call:

```text
feed_open
```

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
feed_capture
feed_curate
feed_classify               # only if required
feed_curate                 # repeat after classification
feed_render
feed_open                   # optional
```

## Failure handling

### `cdp_unavailable`

Start Chrome with `feed_browser_start`, or choose another CDP port.

### `cdp_invalid`

The port is occupied by something that is not Chrome DevTools Protocol. Do not use it. Try `9223` or another free port.

### `chrome_not_found`

Install Chrome/Chromium or set `FEED_TOOLS_CHROME_BIN`.

### `chrome_profile_locked`

Use a dedicated feed-tools profile or close the Chrome process that owns the profile.

### `login_required`

Call `feed_signin_open`, ask the user to log in, then poll `feed_signin_status`.

### `capture_empty`

Do not render. Check auth, selectors, blocked page state, and source-specific access.

### `classification_required`

Classify returned rows with `feed_classify`, then rerun `feed_curate`.

### `tool_timeout`

Retry per source with a lower limit. Avoid multi-source capture if the MCP host has short tool limits.

## When to use Claude in Chrome

Use Claude in Chrome only when all are true:

- the MCP/CDP path is unavailable
- the host has a working Chrome connector
- the user's authenticated browser is only reachable through that connector

When using Claude in Chrome, follow the existing CiC documentation. Do not mix CiC with the MCP/CDP normal path in the same run unless deliberately recovering from a CDP failure.
