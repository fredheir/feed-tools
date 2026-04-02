# Changelog

All notable changes to this repo will be documented in this file.

## [Unreleased]

## [0.2.0] - 2026-04-02

### Added

- Added mount-aware browser file opening so rendered feeds opened from bind-mounted or sandboxed workspaces resolve to a host-visible `file://` path instead of failing when Chrome cannot see the sandbox path ([754b9c45](https://github.com/fredheir/feed-tools/commit/754b9c45d4765b3e198ab37dc44b9d592d71218c)).
- Added `prek`-backed pre-commit hooks for `eslint`, `prettier --check`, and `knip`, so formatting and dead-code regressions are blocked before they reach CI instead of only failing after push ([2219703a](https://github.com/fredheir/feed-tools/commit/2219703a24d33e9d2973d76098d05b61c159bc76)).

### Changed

- Changed browser setup so `capture.browser.cdp` is treated as mutually exclusive with `capture.browser.headed` and `capture.browser.auto_connect`, preventing misleading config combinations that could stall startup or silently ignore the intended connection mode ([754b9c45](https://github.com/fredheir/feed-tools/commit/754b9c45d4765b3e198ab37dc44b9d592d71218c)).
- Changed ranked rendering selection so `feed-render --pick` now supports explicit-first ordering with `...,all`, allowing operators to pin hand-ranked rows first and then append every remaining row in natural order instead of choosing between a strict subset and plain row order ([2219703a](https://github.com/fredheir/feed-tools/commit/2219703a24d33e9d2973d76098d05b61c159bc76)).
- Changed operator guidance and CLI help around CDP warmup, rendered asset paths, and `--pick` ordering so first-run setup is clearer when working with an existing browser session or a sandboxed workspace ([772ad608](https://github.com/fredheir/feed-tools/commit/772ad60878aba2f481f795cc0c8fa34adccf6467)).

### Fixed

- Fixed a capture-time item deduplication bug by importing `getPreferredItemKey` in `source-capture.js`, preventing a runtime failure when collecting unique items ([0cd53507](https://github.com/fredheir/feed-tools/commit/0cd535078b592296f53b117603bdac95d0f26ea7)).
- Fixed browser command output by stripping repeated `agent-browser` daemon warnings about ignored `--args`, so capture and render flows no longer flood logs with duplicate noise once a daemon is already running ([772ad608](https://github.com/fredheir/feed-tools/commit/772ad60878aba2f481f795cc0c8fa34adccf6467)).

## [0.1.1] - 2026-04-02

### Fixed

- Fixed a capture-time item deduplication bug by importing `getPreferredItemKey` in `source-capture.js`, preventing a runtime failure when collecting unique items.

## [0.1.0] - 2026-04-02

### New Features

- Added a feed tooling workflow that captures X timeline items into standardized JSON, renders curated HTML views, and supports summary-plus-tab views for category slices such as coding, politics, and finance.
- Added multi-source feed tooling with LinkedIn capture support, source-specific icons, cross-source combine and prune commands, row-based allocation helpers, and grouped mask generation so operators can curate a single workset across multiple feeds instead of treating X as a one-off flow.
- Added Facebook capture support based on `agent-browser snapshot -c` parsing, which turns Facebook feed posts into normalized feed items instead of leaving Facebook outside the feed pipeline.
- Added Bluesky capture support, including source registration, platform metadata, and normalized post extraction, so Bluesky can be collected and curated alongside Facebook, LinkedIn, and X instead of requiring a separate workflow.

### Added

- Added deterministic feed refresh support that recaptures visible X items, merges them into a source-scoped current working set, and re-renders an existing curated view from a mask without requiring the agent to manually merge old and new feed snapshots.
- Added local JavaScript standards scaffolding with `pnpm`, ESLint flat config, Prettier, Vitest, Knip, Husky hooks, and GitHub Actions so the repo has repeatable lint, format, test, dead-code, and commit checks instead of relying only on ad hoc script validation.
- Added SQLite-backed persistence, export, and backfill commands so captured feeds can be exported, filtered, and re-used from durable state instead of depending only on the latest JSON files in each source directory.
- Added explicit `feed-classify` support and render-context output from `feed-curate`, so uncategorized rows can be assigned back into sqlite with deliberate row-based decisions before rendering continues.

### Changed

- Refactored the feed implementation from X-specific scripts into a modular source-adapter architecture with shared config, storage, merge, mask, rendering, source-capture, and normalization modules, so additional platforms plug into the same standardized JSON and HTML view pipeline instead of duplicating per-source glue.
- Changed curation to center on allocation and mask helpers first, then moved the default curation flow to SQLite-backed state, so classifications, seen/completed flags, and exported worksets survive across refreshes instead of living only in ad hoc JSON sidecars.
- Changed masks to expand selected thread-connected items automatically and to merge per-source allocation state for combined documents, so grouped curation keeps related posts together instead of silently dropping adjacent thread items or cross-source category assignments.
- Changed default setup to start from `config.json.example`, stop tracking local runtime artifacts in git, and steer operators toward host-visible save paths when browser-opened files would break under sandboxed `/tmp` layouts.
- Changed item identity alignment to prefer canonical source URLs and stable synthetic fingerprints over row-position fallbacks, so fallback Facebook, LinkedIn, and X items keep their identity across row moves and export/import cycles instead of duplicating when a feed shifts.
- Changed curation and rendering again to a tighter sqlite-first flow built around `feed-capture`, `feed-curate`, `feed-classify`, and `feed-render`, so category assignment now blocks selection when needed and rendering can build grouped output directly from the current sqlite-backed workset instead of depending on a wider helper command surface.
- Changed browser automation to reuse an existing Chrome session by default, pass per-source browser options through the capture pipeline, and tighten source preparation across Facebook, LinkedIn, Bluesky, and X, so feed collection favors the user’s live browser context over spinning up disposable sessions for every capture.
- Changed default repo paths from `/tmp` to `./var/...` for feed state, assets, and rendered output, so browser-opened files and persisted capture state stay in a host-visible repo-local location instead of disappearing behind sandboxed temporary paths.

### Fixed

- Fixed feed item alignment and deduplication for fallback items by canonicalizing source URLs, extracting Facebook permalinks from embed links, and preferring canonical keys during merge and export, so the same post now updates in place instead of being re-added as a new synthetic item when URLs or row positions vary between captures.
- Fixed Facebook capture internals by extracting parser helpers into a dedicated module without changing the shipped behavior, reducing maintenance risk for the new source adapter while preserving the capture rules introduced in the previous commit.
- Fixed ranked mask expansion to preserve the user’s explicit cross-source selection order even when thread-connected items are expanded behind the scenes, so curated output no longer reorders manually ranked picks.
- Fixed sqlite-backed curation regressions around classification, row listing, and render behavior, so `feed-curate` now exits correctly on uncategorized rows, `feed-classify` writes back to the intended sqlite store, and `feed-render` no longer applies adjacent mask files implicitly.
- Fixed X capture hydration and thread rendering by preferring hydrated tweet rows, allowing avatar-light but otherwise valid posts through, and reordering rendered chains so replies follow their root posts instead of appearing ahead of them.
- Fixed capture defaults and source hydration across Bluesky, Facebook, LinkedIn, and X by hardening wait/error handling and repo-local defaults, reducing partial captures and brittle failures when feeds take longer to hydrate.
- Fixed save-dir resolution so legacy or ambiguous `var` paths normalize to the canonical feed archive location, keeping capture, curation, and classification pointed at the same sqlite state instead of splitting data across adjacent repo directories.
- Fixed authenticated capture failure handling by detecting blocked login or auth-wall states before and after extraction across Facebook, LinkedIn, Bluesky, and X, so an inaccessible feed now fails loudly instead of silently returning an empty capture that looks valid.
- Fixed two follow-on regressions in the browser-backed flow by preventing CDP sessions from silently forcing auto-connect behavior and by ensuring classification writes to the intended sqlite store for the selected workset instead of drifting to the wrong database (PR #2).

### Removed

- Removed the short-lived extra helper command surface such as standalone export, list, mask, override, prune, refresh, and view wrappers after the sqlite curation flow was tightened around the smaller core command set, so the shipped interface now favors fewer primary entry points instead of overlapping alternatives.
