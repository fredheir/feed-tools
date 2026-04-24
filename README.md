Feed Tools helps an agent collect, classify, and render a bespoke social feed based on a user's preferences.

## Quick start

Paste the block below into Claude or Codex:

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
- Keeps Claude in Chrome capture as a separate path for environments where a signed-in browser is available through the Chrome connector instead of CDP

## First-run notes

- Read [AGENTS.md](./AGENTS.md) before doing anything else
- If `config.json` is missing, commands fall back to `config.json.example` for bootstrap only; create a tailored `config.json` before live capture
- Run `./bin/feed-doctor` to choose the capture path before the first capture
- Keep generated state and output under `./var`
- Expect the main working files to be `./var/feed.json`, `./var/feed.html`, and `./var/feed-archive/feed.sqlite`
- Validate CDP before using port `9222`: `curl -sf http://127.0.0.1:9222/json/version`. If another app owns that port, launch the feed browser on `9223` or another free port and set `capture.browser.cdp` accordingly.
