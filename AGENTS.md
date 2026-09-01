# Feed Tool

## Success criteria

- Access the necessary feeds and persist new posts to sqlite
- Tailor output to the user's config or preferences
- Open the rendered file in a new browser tab

## Config

- Read `config.json` in full before making capture, curation, summary, or rendering decisions.
- If `config.json` does not exist, the CLI falls back to `config.json.example` so commands can still run. Treat this as bootstrap only: ask the user how to tailor `sources`, `render`, `curation`, and `summary`, then write a real `config.json`.
- Preferences file: `config.json`
- Default config template: `config.json.example`

## Cloning (private repo)

```sh
# SSH
git clone git@github.com:fredheir/feed-tools.git
# GitHub CLI
gh repo clone fredheir/feed-tools
# HTTPS with token (sandboxed/keyless environments)
git clone https://oauth2:$(gh auth token)@github.com/fredheir/feed-tools.git
```

## Minimal setup

1. Install node + npm + pnpm
2. `pnpm install`
3. Ensure chrome/chromium is installed
4. Run `./bin/feed-doctor` to choose the capture path:
   - If a `cdp:<port>` check is OK, set `capture.browser.cdp` to that port.
   - If CDP is unavailable but `agent-browser` is OK, use `capture.browser: {}` or omit the browser block.
   - If neither is available but the host has Chrome connector MCP tools, use the CiC flow below.
5. If using CDP, confirm the port exposes Chrome DevTools Protocol with `curl -sf http://127.0.0.1:<port>/json/version || curl -sf http://localhost:<port>/json/version || curl -sf http://[::1]:<port>/json/version`.
6. When `capture.browser.cdp` is set, do not also set `capture.browser.headed` or `capture.browser.auto_connect`.
7. Default `capture.browser.args` to `["--no-sandbox"]` only when launching a dedicated browser, not when reusing an existing daemon.
8. For video sources (youtube, tiktok, x, instagram), install yt-dlp with curl_cffi impersonation and local media tools: `pnpm setup:yt-dlp` (requires `uv`) and `pnpm setup:ffmpeg`
9. Access each platform specified in `config.json`

## Setup gotchas

- SSH clone requires a GitHub SSH key; in sandboxed or keyless environments use the HTTPS-with-token method from the Cloning section above.
- If `corepack enable` fails in a read-only environment, install pnpm with npm into the repo-local `.local` directory and prepend `.local/bin` to `PATH`.
- `pnpm install` is expected to work in non-interactive agent/sandbox environments: `agent-browser` and `esbuild` are allowlisted in `pnpm-workspace.yaml`.
- If pnpm still reports blocked builds because an older pnpm version ignored the repo policy, run `node node_modules/agent-browser/scripts/postinstall.js` and `pnpm rebuild esbuild`.
- Run wrappers as `./bin/feed-capture`, `./bin/feed-curate`, `./bin/feed-classify`, `./bin/feed-render`.
- In Cowork sandboxes, run `./bin/feed-signin <source>...` before capture when auth is uncertain; it relaunches workspace Chrome, opens the platform pages, and waits until source-specific auth cookies are visible on disk.
- Keep `assets_dir`, `save_dir`, and rendered HTML under the repo, not `/tmp`.
- Open `./var/feed.html` directly in a browser so relative `feed-assets/` paths resolve; do not rely on a file viewer that fails to serve sibling directories.
- For problems with collection, consult agent-browser directly, and use the ./skills/agent-browser/SKILL.md for reference.

## Sandbox / ephemeral environment

Home (`~`) is wiped between sessions. Keep tools, Chrome, and the profile in the **persistent workspace folder** (wherever the repo lives). `./bin/feed-setup-sandbox` installs pnpm, uv, yt-dlp, and Chrome under the repo and writes `source-env.sh`; run `source ./source-env.sh` in later shells.

```sh
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb
dpkg -x /tmp/chrome.deb <WORKSPACE>/chrome-install
```

Launch Chrome only for the turn that will use it:

```sh
DISPLAY=:0 <WORKSPACE>/chrome-install/opt/google/chrome/google-chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=<WORKSPACE>/chrome-profile \
  --disable-features=LockProfileCookieDatabase \
  --no-sandbox \
  > <WORKSPACE>/chrome.log 2>&1
```

- `DISPLAY=:0` should work without Xvfb in the sandbox environments this project targets.
- Confirm CDP is up with `curl -sf http://127.0.0.1:9222/json/version || curl -sf http://localhost:9222/json/version || curl -sf http://[::1]:9222/json/version`.
- In Cowork VMs, Chrome is reaped at turn end even if launched with `setsid nohup`. Do sign-in and capture in the same turn; the profile on disk persists, but the browser process does not.
- Tell the user to sign in to each platform in that Chrome profile before capture runs if the sandbox browser has not been authenticated yet. Prefer `./bin/feed-signin <source>...`; it keeps the turn open, prints per-source auth-cookie status, and closes Chrome once auth cookies are detected.
- After `feed-signin` succeeds, relaunch Chrome on the same profile and CDP port before running `feed-capture`. `capture.browser: {}` / agent-browser auto-connect expects a running CDP endpoint; it will not cold-launch the signed-in profile after `feed-signin` closes Chrome.
- Then set `"cdp"` to the value reported by `feed-doctor`, for example `"9222"` or `"http://[::1]:9222"`.
- When `capture.browser.cdp` is set, omit `headed` and `auto_connect`.

## CDP port selection

Port `9222` must be a real Chrome DevTools Protocol endpoint. A local browser can listen on `9222` without serving CDP, for example Codex Desktop or another embedded Chromium surface. Always validate with:

```sh
curl -sf http://127.0.0.1:9222/json/version || curl -sf http://localhost:9222/json/version || curl -sf http://[::1]:9222/json/version
```

- If this returns JSON with a `webSocketDebuggerUrl`, `capture.browser.cdp` may use `"9222"`.
- If this returns `404`, HTML, or times out, do not use `"9222"` for feed capture.
- If `9222` is occupied by Codex Desktop or another non-feed browser, launch a dedicated Chrome profile on another port such as `9223` and set `"cdp": "9223"` in `config.json`.
- Keep one persistent profile per capture environment, for example `<WORKSPACE>/chrome-profile-feed`, so platform sign-ins persist and do not collide with the app's built-in browser.
- `./bin/feed-doctor` performs these checks and reports whether agent-browser, CDP, or CiC is the best available path.

## Troubleshooting

- Expect to make proactive fixes. If you hit friction, open an issue or send a verified PR.
- If you are in a sandbox and hit errors with assets not being found, ask findmnt -T <path> for the mount target/source and use that to construct the right path to open in the user's browser.
- If the first CDP command stalls, try `agent-browser --cdp 9222 snapshot` once to warm the daemon. A snapshot timeout is not fatal if `feed-capture` succeeds immediately afterward.

## Git / PRs

- Start with bare `just` to discover the safe, documented recipe list. Use `just check-paths PATH...` and `just test-one TARGET` for focused work, `just check-worktree` for read-only staged/unstaged/renamed/untracked verification, and `just check` before commit/CI handoff. Mutation is explicit through `just fix-worktree` or intentional whole-repository `just fix-all`; there is no legacy `fix` or `check-changed` recipe.
- `just test-fast` runs the complete deterministic Vitest suite. It is the bounded local lane because the suite has no live browser/feed integrations; `just test` currently has the same scope for CI.
- Normal feed commands and `pnpm install` only need this repository's dependencies; consumers do not need `markolo-shared`. Maintainer-only standards recipes such as `just doctor`, `just check`, and `just hooks-install` use the pinned `.repo-standards-ref` cache by default, or an explicit `REPO_STANDARDS_LOCAL` checkout. They fail loudly when the pinned tooling is unavailable; use `just sync-if-needed` only after the standards cache is available.
- Run `just hooks-install` after clone or after hook migration changes.
- Commit hooks require Conventional Commits. Use messages like `feat: add feed doctor` or `fix: handle missing render input`.

## Supported platforms

- facebook
- instagram
- x
- bluesky
- linkedin
- tiktok
- youtube

## Core entry points

```text
feed-capture <source>... [limit] [--assets-dir DIR] [--save-dir DIR]
             [--session NAME] [--state FILE] [--profile DIR]
             [--browser-arg ARG] [--headed]
             [--auto-connect|--no-auto-connect]

feed-signin  <source>... [--cdp PORT] [--interval SECONDS] [--timeout MINUTES]

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
- If output is truncated read `./var/feed.json` directly to see missing rows.
- Use `feed-classify --category Label:rows` to write category assignments back into sqlite
- Category assignment requires manual reasoning by the (sub)agent(s). Read the uncategorized rows and assign explicit categories deliberately.
- Use ADs for sponsored-feeling promos, growth bait, product pushing, marked ads, anything that appears to be a promotion or marketing.
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

## Claude in Chrome (CiC) capture

An alternative to the CDP/agent-browser capture path. Instead of
launching or connecting to a headless browser, the agent drives the
user's real Chrome via Cowork's Claude in Chrome MCP tools.

Keep CiC as a separate, documented avenue. It is not a replacement for
CDP capture: it exists for environments where the authenticated browser
is available through the Chrome connector but not through a usable CDP
daemon.

### When to use CiC

- The user's browser is already authenticated on the target platforms
- No CDP daemon or headless Chrome is available
- Running inside Cowork / Claude Desktop with the Chrome connector enabled

### Supported sources

`x`, `bluesky`, `linkedin`, `instagram`, `tiktok`, `youtube`, `facebook`.
The Facebook CiC adapter reads the rendered DOM directly
(`buildExtractionScript` in `sources/facebook/capture.ts`); the legacy
accessibility-tree path is still the default for the regular
(non-CiC) capture flow.

`youtube`, `instagram`, and `facebook` extraction emit non-canonical
payloads; `lib/cic/ingest.ts` runs per-source pre-normalisers
(`normalizeYouTubeExtractionDocument`,
`normalizeInstagramExtractionDocument`,
`normalizeFacebookExtractionDocument`) before merging.

### CLI

```text
feed-capture-cic prep <source>
feed-capture-cic extract <source> [limit] [--download [filename]]
feed-capture-cic ingest <source> <json-file> [--assets-dir DIR] [--save-dir DIR]
```

### Recommended flow: per-source `browser_batch` with download transport

This is the fastest path that actually works in Cowork today. One
`browser_batch` per source, then bash reads the downloaded file and
ingests. Do **not** chain multiple `[navigate, js]` pairs into one
batch - the next `navigate` destroys the previous tab's pending
`setTimeout`, killing the polling-then-download script before it fires.

One-time setup:

1. Mount `~/Downloads` in the sandbox via the filesystem connector
   (`request_cowork_directory ~/Downloads`). Anything Chrome writes
   to its default download folder then appears under
   `/sessions/.../mnt/Downloads/`.
2. In Chrome: `chrome://settings/content/automaticDownloads` ->
   "Sites can ask to automatically download multiple files".
   (Without this, every download after the first per-session is
   silently blocked.)
3. In `chrome://extensions`, open the Claude in Chrome extension
   details and enable "Allow access to file URLs". This lets CiC open
   the rendered `file:///sessions/.../mnt/.../var/feed.html` tab after
   `feed-render`; without it, render still succeeds but the agent must
   tell the user to open the HTML manually.

Per source:

```
# 1. Generate the polling-aware extract+download script.
script=$(./bin/feed-capture-cic extract x 30 --download cic-capture-x.json)

# 2. Fire one browser_batch:
#    -> mcp__Claude_in_Chrome__browser_batch({
#        actions: [
#          { name: "navigate",         input: { url: "https://x.com/home", tabId } },
#          { name: "javascript_tool",  input: { tabId, action: "javascript_exec", text: script } },
#        ],
#      })
#    The script polls until itemCountExpression returns >= minItems (default 3)
#    and is stable across two ticks, or until the timeout (default 8000ms)
#    fires, then triggers exactly one <a download>. File lands at
#    ~/Downloads/cic-capture-x.json.

# 3. Read + ingest from the sandbox mount path exposed by the filesystem connector:
./bin/feed-capture-cic ingest x /sessions/.../mnt/Downloads/cic-capture-x.json
```

Repeat steps 1-3 for each source you want.

### Fallback: console.log channel

Use this when the download path is unavailable (no `~/Downloads` mount,
or auto-downloads disabled in Chrome). Two MCP round-trips per source
and a per-source byte cap of roughly 100-200 KB.

```
# 1. Get navigation + ready-check metadata
prep=$(./bin/feed-capture-cic prep x)

# 2. Navigate
#    -> mcp__Claude_in_Chrome__navigate({ url: prep.url, tabId })

# 3. Run each readyCheck via javascript_tool
#    -> mcp__Claude_in_Chrome__javascript_tool({ text: check, tabId })

# 4. Scroll to top + extract via console.log
script=$(./bin/feed-capture-cic extract x 30)
#    The CiC security filter blocks URL-containing JSON in return values,
#    so wrap the script to log instead:
#    -> mcp__Claude_in_Chrome__javascript_tool({
#        text: 'console.log("CIC_DATA:" + (' + script + '))',
#        tabId
#      })
#    -> mcp__Claude_in_Chrome__read_console_messages({
#        tabId, pattern: "CIC_DATA", clear: true
#      })
#    NOTE: read_console_messages must be called once on the tab before
#    the message fires, otherwise the line is dropped. In a batch, put a
#    no-op read_console_messages action before navigate, then navigate,
#    run javascript_tool, and read_console_messages again.
#    -> strip the "CIC_DATA:" prefix and save the JSON.

# 5. Ingest as usual
./bin/feed-capture-cic ingest x ./var/cic-capture-x.json
```

#### console.log gotchas (read this if you choose this path)

- **Console tracking starts on first read.** A `read_console_messages`
  call that arrives before the first `console.log` on the tab silently
  returns nothing. Either (a) put a no-op `read_console_messages` as
  the first action in your batch, or (b) accept that the read
  immediately following the JS will miss and do a follow-up read in
  the next turn - by then the message is buffered and survives until
  you `clear: true`.
- **Wait for items before logging.** The synchronous extract right
  after `navigate` runs against an empty DOM. Wrap the script in a
  poll loop that only fires `console.log` once
  `itemCountExpression >= minItems` or a timeout elapses (same shape
  as `buildDownloadExtractionScript` uses for the download path -
  reuse the polling wrapper or copy it).
- **Always pass `pattern`.** `read_console_messages` returns up to 100
  unrelated app logs without it. Use a unique prefix per source
  (`CIC_DATA_x`, `CIC_DATA_bluesky`, etc.) and pass that prefix as
  `pattern` so reads can't cross-contaminate.
- **Set `clear: true`.** Otherwise re-reads (which you'll do on
  retries) return stale data plus the new line.
- **Per-source byte budget ~100-200 KB.** A 30-card YouTube payload
  (~30 KB) sails through; a payload past ~200 KB risks being truncated
  by the connector. If you need bigger, switch to the download path.
- **Don't chain navigates in one batch.** Each `navigate` destroys the
  previous tab's JS heap, killing any pending `setTimeout` from a
  polling extract. Use one `browser_batch` per source: `[navigate,
poll-and-log JS]`, then a separate later `read_console_messages`.
- **The CiC security filter strips URL-bearing JSON from JS return
  values.** That's why we route via `console.log` in the first place;
  do not try to "just return the JSON" from `javascript_tool` for
  sources whose payloads contain URLs.

### Continue with the standard pipeline

```
./bin/feed-curate --sources x
./bin/feed-render --tab
```

If the Claude in Chrome extension has "Allow access to file URLs"
enabled, navigate CiC to the rendered `file://` URL after `feed-render`
so the result opens in the user's browser. If that toggle is off, do
not debug the renderer; tell the user the HTML was written and give the
path to open manually.

### Config

No special config is needed. CiC capture reads the same `config.json`
for `assets_dir`, `save_dir`, and curation settings. The `browser`
block is ignored when using the CiC path.

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

### Ranked flow

Use this when you want curated ordering instead of plain row order.

- Rank candidate root rows after `feed-curate` and before `feed-render`.
- `--pick` order is the display order within each tab.
- Thread children expand automatically from the selected root row.
- Pass root rows only. Do not list thread children separately unless you intentionally want to override thread order.
- Suggested score:
  `likes + reposts*2 + views*0.001`
- If you want only a partial ordering override, append `all` to the pick list.
  Example:
  `--pick 8,5,12,1,3,all`
  This pins rows `8,5,12,1,3` first, then appends every unlisted row in normal row order.

```sh
feed-capture x bluesky
feed-curate --sources x,bluesky
# feed-classify --category "Tech & AI:1,3" --category "Politics:5,8,12"
feed-render --pick 8,5,12,1,3,all --tab
```
