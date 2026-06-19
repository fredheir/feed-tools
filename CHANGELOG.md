# Changelog

All notable changes to this repo will be documented in this file.

## [Unreleased]

### Fixed

- Made the slop-scan baseline job run for manual workflow dispatches, so operator-triggered CI checks no longer complete as a misleading skipped workflow.
- Routed feed-tools GitHub Actions directly to GitHub-hosted runners, removing the inherited self-hosted label that left push checks queued indefinitely.
- Skipped private shared-standards jobs for Dependabot pull requests, preventing unauthenticated dependency PRs from failing on unavailable repository secrets.
- Refreshed the Vite and js-yaml pins to patched versions, clearing the open GitHub dependency alerts for the test and commitlint toolchain.

## [0.5.0] - 2026-06-11

### New Features

- Added a local `feed-mcp` setup/status server with tools for doctor checks, CDP browser status/start, sign-in status/opening, and config read/write, giving MCP hosts a structured setup path while keeping capture, curation, classification, and rendering on the existing CLI workflow (PR [#59](https://github.com/fredheir/feed-tools/pull/59)).
- Added `feed-mcp-config` and MCP setup documentation, so operators can print a local MCP host configuration and follow the implemented setup/browser/sign-in/config flow instead of relying on target-interface notes ([f1b9f88](https://github.com/fredheir/feed-tools/commit/f1b9f88c79d03d56830a6976067473a0ad843e0f)).

### Added

- Added a slop-scan delta-ratchet workflow and moved `slop-scan` to the maintained `modem-dev` fork, so pull requests fail only on added or worsened findings while default-branch scans preserve the baseline (PR [#57](https://github.com/fredheir/feed-tools/pull/57)).

### Changed

- Centralized source manifests, sign-in metadata, and CiC extraction scripts, reducing duplicated per-source wiring while preserving the existing source capture behavior (PR [#66](https://github.com/fredheir/feed-tools/pull/66)).
- Extracted browser capture orchestration into a shared flow, so source captures keep the same behavior while using one maintained launch/capture path (PR [#67](https://github.com/fredheir/feed-tools/pull/67)).
- Updated GitHub Actions maintenance by bumping `pnpm/action-setup` to 6.0.8, keeping CI pins current without changing the feed runtime (PR [#56](https://github.com/fredheir/feed-tools/pull/56)).

### Fixed

- Fixed browser startup so endpoint-form CDP values are honored, invalid endpoints are reported explicitly, and launched browsers return the verified CDP port instead of silently drifting to the wrong endpoint (PR [#68](https://github.com/fredheir/feed-tools/pull/68)).
- Fixed the dependency-scan baseline by adding a `brace-expansion >=5.0.6` override, clearing the recorded advisory instead of carrying a stale vulnerable transitive pin ([5aaee00](https://github.com/fredheir/feed-tools/commit/5aaee00e9dde024c0a6aa4b21790de5f8df29120)).

## [0.4.1] - 2026-05-19

### Changed

- Updated the GitHub Actions `pnpm/action-setup` pin to 6.0.5 and recorded the current `fast-uri` advisory deferral in the dependency-scan baseline, keeping CI and dependency review state current while the patched transitive release ages through policy (PR [#47](https://github.com/fredheir/feed-tools/pull/47), [e926490](https://github.com/fredheir/feed-tools/commit/e92649023d9cf0663ee04ccf2d8d0acbb63492df)).
- Added Safe Chain to the test workflow and aligned the dependency-age guard to a 72-hour minimum, so CI installs now enforce the same package-age policy that operators see during dependency review (PR [#50](https://github.com/fredheir/feed-tools/pull/50)).
- Added a local `feed-setup-ffmpeg` installer, wired sandbox setup and doctor checks to require `ffmpeg`/`ffprobe`, and made stale audio-only yt-dlp downloads get replaced before rendering, so video-heavy captures have a repeatable setup path and avoid reusing unusable media files (PR [#49](https://github.com/fredheir/feed-tools/pull/49)).
- Configured `pnpm install` for noninteractive agent and sandbox environments by allowlisting the required `agent-browser` and `esbuild` builds while leaving maintainer hook installation disabled, reducing first-run setup friction for feed operators (PR [#53](https://github.com/fredheir/feed-tools/pull/53)).
- Switched the actions-hygiene workflow to the shared repo-standards guard and skipped forked pull requests that cannot access the private standards token, so workflow hardening now follows the maintained standard path without failing external PRs for missing credentials (PR [#55](https://github.com/fredheir/feed-tools/pull/55)).

### Fixed

- Hardened video feed capture by treating YouTube and TikTok cards as externally linked video posts instead of forcing every captured card through local video download, while expanding YouTube selectors to cover more feed layouts and filtering sponsored cards earlier (PR [#51](https://github.com/fredheir/feed-tools/pull/51)).
- Fixed Facebook capture filtering so posts that expose only a plain author profile link are retained when they also have permalink evidence, while reserved navigation slugs and permalink URLs are rejected as author fallbacks (PR [#52](https://github.com/fredheir/feed-tools/pull/52)).
- Cleared the deferred `fast-uri` advisories by adding a pnpm override for `fast-uri >=3.1.2`, refreshing the lockfile, and recording a clean dependency-scan baseline (PR [#54](https://github.com/fredheir/feed-tools/pull/54)).

## [0.4.0] - 2026-05-10

### Fixed

- Removed the silent `try`/`except` around the preflight `closeBrowserSession` call in `source-capture`, so failures during the pre-capture session reset now propagate and fail loud instead of being swallowed and proceeding into a stale session; the call now also forwards `cdp` and `executablePath` so the reset targets the same browser the capture will use (PR [#46](https://github.com/fredheir/feed-tools/pull/46)).

### Breaking

- Removed the legacy snake_case aliases (`auto_connect`, `session_name`, `state`, `state_path`, `color_scheme`, `executable_path`, `allow_file_access`, `browser_args`) from the browser config normalization; configs and callers must now use the canonical camelCase keys (`autoConnect`, `sessionName`, `statePath`, `colorScheme`, `executablePath`, `allowFileAccess`, `args`) instead of the previously-supported snake_case fallbacks (PR [#45](https://github.com/fredheir/feed-tools/pull/45)).

## [0.3.1] - 2026-05-02

### Changed

- Changed the `_repo-standards` guard script to auto-detect the `markolo-shared` standards installation from `$HOME/Projects/markolo-shared` and sibling-directory paths, so the guard no longer requires `REPO_STANDARDS_LOCAL` to be set explicitly when the standards checkout exists at a conventional location ([101da371](https://github.com/fredheir/feed-tools/commit/101da371f0053cc0bd33aec44e8c093be923ec8d)).
- Scoped CI workflows (`lint`, `dead-code`, `tests`, `typecheck`, `dependency`) to path filters so pushes and PRs that touch only unrelated files no longer trigger unnecessary workflow runs ([e5c9cc71](https://github.com/fredheir/feed-tools/commit/e5c9cc7181cc630cd27afb3407ddaaaf1939db8d)).

### Fixed

- Fixed first-run source capture and doctor preflight probes so a missing browser session or unreadable `~/.ssh` directory reports recoverably instead of aborting the capture or doctor command (PR [#38](https://github.com/fredheir/feed-tools/pull/38)).
- Tightened capture and CLI error handling so operational failures are reported explicitly while preserving the existing feed capture workflow (PR [#37](https://github.com/fredheir/feed-tools/pull/37)).

## [0.3.0] - 2026-04-29

### Added

- Added CiC capture support for YouTube, TikTok, X download transport, and Facebook capture, so operators can collect more source-specific campaign evidence through the same capture workflow instead of using one-off browser scripts.
- Added `feed-doctor`, sandbox bootstrap, and sign-in flow improvements, making browser/runtime setup easier to diagnose and recover in sandboxed or bind-mounted workspaces.

### Changed

- Migrated the feed tooling runtime to strict TypeScript with native Node 24 TypeScript execution, removing the custom `tsx` loader wrapper while keeping the CLI entrypoints intact.
- Adopted the shared repo standards command surface and actions hygiene gates, so local and CI maintenance checks now follow the Markolo repo contract instead of repo-local guard wiring.

### Fixed

- Fixed CiC/X capture extraction and async CLI error handling, so failed capture paths surface cleanly and X downloads produce more reliable captured output.

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
