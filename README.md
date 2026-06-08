Feed Tools helps an agent collect, classify, and render a bespoke social feed based on a user's preferences.

## Quick start: MCP/CDP path

Use the local MCP server as the primary agent interface. It keeps browser operation inside feed-tools and uses a local signed-in Chrome profile over CDP.

```text
agent / MCP host
  -> feed-tools MCP server
     -> feed-tools capture, curation, classification, and render services
        -> local Chrome profile over CDP
        -> ./var/feed-archive, ./var/feed.json, ./var/feed.html
```

Clone and install:

```sh
gh repo clone fredheir/feed-tools
cd feed-tools
pnpm install
```

Configure the MCP host with the local server:

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

Then have the agent follow [docs/mcp-agent-runbook.md](./docs/mcp-agent-runbook.md):

1. `feed_doctor`
2. `feed_browser_status` or `feed_browser_start`
3. `feed_config_read` or `feed_config_write`
4. `feed_signin_status` and `feed_signin_open` for missing platform logins
5. `feed_capture`
6. `feed_curate`
7. `feed_classify` if required
8. `feed_render` with `open: true` if the user wants the rendered feed opened in Chrome

The user still completes platform login in the opened Chrome profile.

## Quick start: CLI path

Paste the block below into Claude or Codex when MCP is not yet configured:

```text
Start by cloning this repository:

gh repo clone fredheir/feed-tools
https://github.com/fredheir/feed-tools.git

Place this in the user's workspace, not in a sandbox - files should be accessible for the html rendering process.

Then read [AGENTS.md](./AGENTS.md) and follow the instructions.

Ask me questions about my preferences:
- which platforms I care about
- which categories I want
- whether I want tabs or a single grouped feed
- how concise or opinionated the summary should be
- whether I want ranked or unranked feed.

Use that to create the config.

Then jump straight into feed capture. Run the necessary commands and compile the feed according to my preferences.

Use the current core flow:
- feed-capture
- feed-curate
- if needed, feed-classify
- feed-render

After the initial run, offer to render a feed about a particular topic (see Topic Flow).
```

## What the repo does

- Captures feeds from `x`, `facebook`, `instagram`, `linkedin`, `bluesky`, `tiktok`, and `youtube`
- Persists feed state in sqlite under `./var/feed-archive`
- Supports row-based curation and explicit classification before rendering
- Renders a local HTML feed under `./var/feed.html`
- Reuses the user's existing Chrome via CDP when available
- Provides a local MCP server so agents can call feed workflow tools directly
- Keeps Claude in Chrome capture as a fallback path for environments where a signed-in browser is available through the Chrome connector instead of CDP

## First-run notes

- Prefer the MCP/CDP path for new agent runs; see [docs/mcp.md](./docs/mcp.md)
- Read [AGENTS.md](./AGENTS.md) before doing direct CLI work
- If `config.json` is missing, commands fall back to `config.json.example` for bootstrap only; create a tailored `config.json` before live capture
- `pnpm install` is configured for non-interactive setup: required native builds for `agent-browser` and `esbuild` are allowlisted, while maintainer hooks stay disabled by default
- Run `./bin/feed-doctor` or MCP `feed_doctor` to choose the capture path before the first capture
- For video-heavy sources such as YouTube, TikTok, X, and Instagram, run `pnpm setup:yt-dlp` and `pnpm setup:ffmpeg` before capture
- Keep generated state and output under `./var`
- Expect the main working files to be `./var/feed.json`, `./var/feed.html`, and `./var/feed-archive/feed.sqlite`
- Validate CDP before using port `9222`: `curl -sf http://127.0.0.1:9222/json/version`. If another app owns that port, launch the feed browser on `9223` or another free port and set `capture.browser.cdp` accordingly.
