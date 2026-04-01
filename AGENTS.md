# Feed Tool

- Agent success criteria:
  `install necessary tools`
  `interview the user and create config.json if it does not exist`
  `access the necessary feeds`
  `tailor output to the user's config`
  `open the rendered file in a new browser tab`
- Read `config.json` in full before making capture, curation, summary, or rendering decisions.
- Use `config.json.example` as the default starting point when creating `config.json`.
- If `config.json` does not exist, ask the user how to populate:
  `sources`
  `render`
  `curation`
  `summary`
- If `config.json` does not exist, do not ask about render settings, archive paths, or other technical defaults unless the user explicitly cares. Start from `config.json.example`, interview for feed/content preferences, and keep the technical defaults.
- Minimal setup:
  `install node+npm+pnpm`
  `pnpm install`
  `ensure chrome/chromium is installed`
  `pnpm exec agent-browser --auto-connect get url`
  `log into x.com in the browser agent-browser uses`
  `log into linkedin.com in the browser agent-browser uses`
- Setup gotchas:
  `SSH clone may fail in sandboxed environments; use HTTPS with gh auth token if needed`
  `if corepack enable fails in a read-only environment, install pnpm with npm into ~/.local and prepend ~/.local/bin to PATH`
  `after pnpm install, run pnpm approve-builds and approve agent-browser if builds are blocked`
  `bin/* scripts call agent-browser directly; ensure node_modules/.bin is on PATH or invoke via pnpm exec`
  `sandboxed /tmp output may not be visible to the host browser; write output HTML to a host-visible path when needed`
- Supported platforms:
  `x`
  `linkedin`
- Entry points:
  `feed-capture <source> ...`
  `feed-combine <output-json> <input-json>...`
  `feed-list <input-json> [limit]`
  `feed-list <input-json> [limit] [--allocation FILE] [--unclassified]`
  `feed-allocate <input-json> [--allocation FILE] [--category Label:rows]`
  `feed-mask <input-json> <output-mask> [--tab Label:rows] [--summary-file FILE] [--summary TEXT]`
  `feed-prune <input-json> [output-json] [--in-place] [--keep ids] [--drop ids]`
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
- Default config template:
  `config.json.example`
- Curation inject point:
  `capture -> agent classifies uncategorized items -> agent selects rows -> tool writes mask -> render`
- Use `feed-combine` to build multi-source documents instead of ad hoc shell pipelines.
- Use `feed-prune` to clean current or derived feed documents instead of manually editing JSON.
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
- Follow `user_preferences.curation.target_items_per_tab` as a target, not a hard minimum.
- Follow `user_preferences.curation.relevance_policy` strictly; do not pad tabs with weak items just to hit the target.
- Follow `user_preferences.curation.fallback_category` for selected items that have not been explicitly classified yet.
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
  `agent reads config.json in full`
  `feed-capture x > /tmp/feed.json`
  `feed-list /tmp/feed.json --unclassified`
  `agent classifies unclassified or newly-relevant posts with feed-allocate`
  `if a new category is added, rerun classification for items that should move into it`
  `agent selects rows in preferred order`
  `feed-mask /tmp/feed.json /tmp/feed-mask.json --pick 1,4,9,5,2`
  `feed-render /tmp/feed.json --mask /tmp/feed-mask.json /tmp/feed.html`
  `feed-open /tmp/feed.html`
- Refresh current view:
  `feed-refresh x --mask /tmp/feed-mask.json /tmp/feed.html`
  `feed-open /tmp/feed.html`
