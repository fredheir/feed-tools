# Feed Tool

## Agent success criteria

- Install necessary tools
- Interview the user and create `config.json` if it does not exist
- Access the necessary feeds and persist new posts to the database
- Tailor output to the user's config or preferences, showing the most relevant posts first
- Open the rendered file in a new browser tab

## Config

- Read `config.json` in full before making capture, curation, summary, or rendering decisions.
- If `config.json` does not exist, ask the user how to populate `sources`, `render`, `curation`, and `summary` from `config.json.example`.
- Preferences file: `config.json`
- Default config template: `config.json.example`

## Minimal setup

1. Install node + npm + pnpm
2. `pnpm install`
3. Ensure chrome/chromium is installed
4. Attach to the user's existing Chrome via CDP when available
5. Set `capture.browser.cdp` in `config.json` and reuse that browser if the user's browser already exposes remote debugging (e.g. on `127.0.0.1:9222`)
6. Access each platform specified in `config.json`

## Setup gotchas

- SSH clone may fail in sandboxed environments; use HTTPS with `gh auth token` if needed.
- If `corepack enable` fails in a read-only environment, install pnpm with npm into `~/.local` and prepend `~/.local/bin` to `PATH`.
- After `pnpm install`, run `pnpm approve-builds` and approve `agent-browser` if builds are blocked.
- `bin/*` scripts call `agent-browser` directly; run them as `./bin/feed-capture`, `./bin/feed-combine`, etc.
- Run browser-backed commands with `--browser-arg '--no-sandbox'`.
- Use `feed-session-init` when you explicitly want a separate managed browser session. Use the user's existing browser by default.

## Supported platforms

- facebook
- x
- bluesky
- linkedin

## Entry points

```
feed-capture  <source>... [limit] [--assets-dir DIR] [--save-dir DIR]
              [--session NAME] [--state FILE] [--profile DIR]
              [--browser-arg ARG] [--headed]
              [--auto-connect|--no-auto-connect]

feed-combine  <output-json> <input-json>...

feed-curate   <output-json> [--sources name1,name2,...] [--save-dir DIR]
              [--limit N] [--exclude-seen] [--exclude-completed]
              [--unclassified]

feed-export   <output-json> [--sources name1,name2,...] [--save-dir DIR]
              [--limit N] [--exclude-seen] [--exclude-completed]

feed-list     <input-json> [limit] [--unclassified]

feed-allocate <input-json> [--category Label:rows]

feed-mask     <input-json> [output-mask] [--pick rows|all]
              [--tab Label:rows] [--summary-file FILE] [--summary TEXT]

feed-prune    <input-json> [output-json] [--in-place]
              [--keep ids] [--drop ids]

feed-render   <input-json> [output-html] [--mask <mask-json>]

feed-view     [source] [limit] [--assets-dir DIR] [--save-dir DIR]
              [--ids x:...,x:...] [--session NAME] [--state FILE]
              [--profile DIR] [--browser-arg ARG] [--headed]
              [--auto-connect|--no-auto-connect]

feed-open     <path-or-url>

feed-refresh  [source|all] --mask <mask-json> <output-html>

feed-override <output-json> [--sources name1,name2,...] [--save-dir DIR]
              [--matches term1,term2,...] [--page N] [--page-size N]
```

### Entry point notes

- `feed-capture` accepts one or more sources and emits a combined JSON document when multiple sources are requested.
- `feed-capture` automatically merges new items into current state and emits the merged document.
- `--allocation FILE` is a legacy override; default classification state now lives in sqlite.

## Data model

### Standard JSON

```json
{ "schema_version": 1, "source": "...", "captured_at": "...", "items": [...] }
```

### Canonical item identity

- `item.id` — primary
- `item.source_item_id` — source-native stable id

### Persistent state

Merged items, seen/completed flags, and allocation/classification live in `<save_dir>/feed.sqlite`.

### Archive layout

- Snapshots: `<save_dir>/<source>/snapshots/*.json`
- Latest snapshot: `<save_dir>/<source>/latest.json`
- Current merged state: `<save_dir>/<source>/current.json`

### Mask JSON

Simple form:

```json
{ "item_ids": ["x:2039234243222769835", "x:2039118568252707144"] }
```

Extended form (with tabs and summary):

```json
{
  "summary": "...",
  "tabs": [{
    "label": "Coding",
    "groups": [{
      "label": "Agent workflows",
      "item_ids": ["x:2039234243222769835"]
    }]
  }]
}
```

## Curation

### Pipeline

`capture` -> agent classifies uncategorized items -> agent selects rows -> tool writes mask -> `render`

- Prefer DB-backed curation flows: capture into sqlite, export or curate from sqlite, then apply a mask and render.
- Use `feed-curate` for row selection against the current sqlite-backed document.
- Use `feed-export` when a plain exported JSON workset is enough.
- `feed-override` is an optional helper for ad hoc keyword scanning. Do not recommend it as the default collection or curation path.
- Use a keyword battery, not a single keyword. If first-pass hits surface new current-affairs terms, names, places, or organizations that should have been in the battery, run a second pass with an expanded battery before selecting rows.
- Use `feed-combine` to build multi-source documents instead of ad hoc shell pipelines. Use it when combining documents that were already captured to separate JSON files.
- Use `feed-prune` to clean current or derived feed documents instead of manually editing JSON.

### Summary

- Agent may populate `summary` if requested.
- `summary` is the primary high-signal output: write what matters most for this user in this feed if they only read one thing.
- Follow `user_preferences.summary.custom_instructions` closely.

### Tabs

- Agent may populate `tabs` for multiple categories.
- Follow `user_preferences.curation.target_items_per_tab` as a target, not a hard minimum.
- Follow `user_preferences.curation.relevance_policy` strictly; do not pad tabs with weak items just to hit the target.
- Follow `user_preferences.curation.fallback_category` for selected items that have not been explicitly classified yet.

## Source code layout

- Source adapters: `sources/<source>/capture.js`
- Shared code: `lib/config.js`, `lib/browser.js`, `lib/assets.js`, `lib/mask.js`, `lib/render-html.js`, `lib/render-item.js`, `lib/render-css.js`, `lib/merge.js`

## Example flows

### Default

```sh
feed-view
```

### Minimal curated flow

```sh
feed-capture x
feed-export ./var/feed.json --sources x
# agent replies with item ids
feed-mask ./var/feed.json \
  --tab Picks:x:2039234243222769835,x:2039118568252707144 \
  --summary 'Selected posts relevant to the current ask.'
feed-render ./var/feed.json ./var/feed.html
feed-open ./var/feed.html
```

### Tabbed curated flow

```sh
# agent reads config.json in full
feed-curate ./var/feed.json --unclassified
feed-allocate ./var/feed.json --category Coding:1,4 --category Politics:2
feed-mask ./var/feed.json --pick 1,4,2 \
  --summary 'Curated highlights organized into the configured categories.'
feed-render ./var/feed.json ./var/feed.html
feed-open ./var/feed.html
```

### Topic override flow

```sh
feed-capture x bluesky
feed-curate ./var/war.json --sources x,bluesky
# agent selects rows from the curate output using the current sqlite-backed state
feed-mask ./var/war.json --pick 27 \
  --summary 'War-related items selected from the current sqlite-backed feed state.'
feed-render ./var/war.json ./var/war.html
feed-open ./var/war.html
```

### Refresh current view

```sh
feed-refresh x --mask ./var/feed-mask.json ./var/feed.html
feed-open ./var/feed.html
```
