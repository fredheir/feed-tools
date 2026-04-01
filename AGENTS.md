# Feed Tool

- Read `config.json` first.
- If `config.json` does not exist, interview the user before proceeding:
  1. Copy `config.json.example` to `config.json`.
  2. Ask the user:
     - What platforms do you follow? (x, etc.)
     - What topics/areas of interest should feed curation prioritise?
       (these become `curation.preferred_categories`)
     - Any instructions for how summaries should read?
       (becomes `summary.custom_instructions`)
  3. Update `config.json` with their answers. Do not ask about render settings,
     archive paths, or other technical defaults — use the example values.
- Minimal setup:
  `install node+npm+pnpm`
  `pnpm install`
  `ensure chrome/chromium is installed`
  `pnpm exec agent-browser --auto-connect get url`
  `log into x.com in the browser agent-browser uses`
- Setup gotchas:
  - SSH clone often fails in sandboxed environments. Use HTTPS with gh auth token:
    `GH_TOKEN=$(gh auth token) && git clone https://x-access-token:${GH_TOKEN}@github.com/OWNER/REPO.git`
  - If `corepack enable` fails (read-only fs), install pnpm via:
    `npm install -g pnpm --prefix ~/.local`
    Then prepend `~/.local/bin` to PATH for every shell invocation.
  - After `pnpm install`, approve agent-browser build scripts:
    `pnpm approve-builds` (select agent-browser)
  - All `bin/*` scripts call `agent-browser` directly. Ensure `node_modules/.bin` is on PATH
    or invoke via `pnpm exec`.
  - `/tmp` inside a sandbox may not be visible to the host browser. Write output HTML
    to a host-accessible path (e.g. the repo dir) and open from there.
- Supported platforms:
  `x`
- Entry points:
  `feed-capture <source> ...`
  `feed-render <input-json> [--mask <mask-json>] <output-html>`
  `feed-view <source> [limit] [--assets-dir DIR] [--save-dir DIR] [--ids 1,2,3]`
  `feed-open <path-or-url>`
  `feed-refresh [source] --mask <mask-json> <output-html>`
- Standard JSON:
  `{ "schema_version": 1, "source": "...", "captured_at": "...", "items": [...] }`
- Canonical item identity:
  `item.id` is primary
  `item.source_item_id` is the source-native stable id
- Preferences file:
  `config.json`
- Curation inject point:
  `capture -> agent writes mask -> render`
- Capture merge behavior:
  `feed-capture` automatically merges new items into current state and emits the merged document
- Archive layout:
  snapshots: `<save_dir>/<source>/snapshots/*.json`
  latest snapshot: `<save_dir>/<source>/latest.json`
  current merged state: `<save_dir>/<source>/current.json`
- Mask JSON:
  `{ "item_ids": ["x:2039234243222769835", "x:2039118568252707144"] }`
- Agent may populate `summary` if requested.
- `summary` is the primary high-signal output: write what matters most for this user in this feed if they only read one thing.
- Follow `user_preferences.summary.custom_instructions` closely.
- Agent may populate `tabs` for multiple categories.
- Extended mask shape:
  `{ "summary": "...", "tabs": [{ "label": "Coding", "groups": [{ "label": "Agent workflows", "item_ids": ["x:2039234243222769835"] }] }] }`
- Source adapters:
  `sources/<source>/capture.js`
- Shared code:
  `lib/config.js`
  `lib/browser.js`
  `lib/assets.js`
  `lib/mask.js`
  `lib/render-html.js`
  `lib/render-item.js`
  `lib/render-css.js`
  `lib/merge.js`
- X flow:
  `feed-view x`
- Minimal curated flow:
  `feed-capture x > /tmp/feed.json`
  `agent replies with item ids`
  `feed-render /tmp/feed.json --ids x:2039234243222769835,x:2039118568252707144 /tmp/feed.html`
  `feed-open /tmp/feed.html`
- Tabbed curated flow:
  `agent writes /tmp/feed-mask.json with summary + tabs`
  `feed-render /tmp/feed.json --mask /tmp/feed-mask.json /tmp/feed.html`
  `feed-open /tmp/feed.html`
- Refresh current view:
  `feed-refresh x --mask /tmp/feed-mask.json /tmp/feed.html`
  `feed-open /tmp/feed.html`
