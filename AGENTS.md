# Feed Tool

## Success criteria

- Access the necessary feeds and persist new posts to sqlite
- Tailor output to the user's config or preferences
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
4. Default to the user's existing Chrome via CDP
5. If the user's browser exposes remote debugging on `127.0.0.1:9222`, set `capture.browser.cdp` to `9222` in `config.json` and reuse that browser
6. Default `capture.browser.args` to `["--no-sandbox"]`
7. Access each platform specified in `config.json`

## Setup gotchas

- SSH clone may fail in sandboxed environments; use HTTPS with `gh auth token` if needed.
- If `corepack enable` fails in a read-only environment, install pnpm with npm into `~/.local` and prepend `~/.local/bin` to `PATH`.
- After `pnpm install`, run `pnpm approve-builds` and approve `agent-browser` if builds are blocked.
- Run wrappers as `./bin/feed-capture`, `./bin/feed-curate`, `./bin/feed-classify`, `./bin/feed-render`.
- Keep `assets_dir`, `save_dir`, and rendered HTML under the repo, not `/tmp`.

## Supported platforms

- facebook
- x
- bluesky
- linkedin

## Core entry points

```text
feed-capture <source>... [limit] [--assets-dir DIR] [--save-dir DIR]
             [--session NAME] [--state FILE] [--profile DIR]
             [--browser-arg ARG] [--headed]
             [--auto-connect|--no-auto-connect]

feed-curate  [output-json] [--sources name1,name2,...] [--save-dir DIR]
             [--limit N] [--exclude-seen] [--exclude-completed]
             [--matches term1,term2,...]

feed-classify [input-json] --category Label:rows [--category Label:rows]...

feed-render  [input-json] [output-html] [--pick rows|all] [--tab] [--summary TEXT]
```

## Data model

- Standard JSON:
  `{ "schema_version": 1, "source": "...", "captured_at": "...", "items": [...] }`
- Canonical item identity:
  `item.id` is primary
  `item.source_item_id` is the source-native stable id
- Persistent state:
  merged items, seen/completed flags, and allocation/classification live in `<save_dir>/feed.sqlite`

## Curation pipeline

`capture -> curate -> render`

- `feed-capture` persists to sqlite and emits the merged document
- `feed-curate` exports a sqlite-backed workset, prints row-numbered selection output, and prints the relevant render/curation/summary config fields the agent should follow
- If uncategorized rows exist in the current result set, `feed-curate` must fail and force classification before selection continues
- Use `feed-classify --category Label:rows` to write category assignments back into sqlite
- Category assignment requires manual reasoning by the (sub)agent(s). Read the uncategorized rows and assign explicit categories deliberately
- `feed-render` groups by category by default, applies the default mask if present, accepts optional subset and summary flags directly, writes HTML, and opens it
- `--tab` toggles category selectors on; without `--tab`, items are grouped by category inline in a single feed
- Default paths:
  `feed-curate` writes `./var/feed.json`
  `feed-render` reads `./var/feed.json` and writes `./var/feed.html`
- Use a keyword battery, not a single keyword, when selecting topic rows
- If first-pass hits reveal adjacent current-affairs terms, rerun the curation pass with an expanded battery before selecting rows

## Summary and tabs

- Agent may populate `summary` if requested
- `summary` is the primary high-signal output: write what matters most for this user if they only read one thing
- Follow `user_preferences.summary.custom_instructions` closely
- Follow `user_preferences.curation.target_items_per_tab` as a target, not a hard minimum
- Follow `user_preferences.curation.relevance_policy` strictly; do not pad with weak items
- Follow `user_preferences.curation.fallback_category` for selected items that have not been explicitly classified yet

## Source code layout

- Source adapters: `sources/<source>/capture.js`
- Shared code: `lib/config.js`, `lib/browser.js`, `lib/assets.js`, `lib/mask.js`, `lib/render-html.js`, `lib/render-item.js`, `lib/render-css.js`, `lib/merge.js`

## Example flows

### Minimal curated flow

```sh
feed-capture x bluesky
feed-curate --sources x,bluesky
# if feed-curate errors with uncategorized rows in this result set:
# feed-classify --category Politics:14,18 --category Coding:2
feed-render
```

### Topic flow

```sh
feed-capture x bluesky
feed-curate --sources x,bluesky --matches 'trump,donald,maga,white house,potus,president,administration,gop,republican' 
# if feed-curate errors with uncategorized rows in this result set:
# feed-classify --category Politics:14,18 --category Coding:2
feed-render --summary 'US forces ...[insight from content]'
```
