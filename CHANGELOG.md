# Changelog

All notable changes to this repo will be documented in this file.

## [Unreleased]

### New Features

- Added a feed tooling workflow that captures X timeline items into standardized JSON, renders curated HTML views, and supports summary-plus-tab views for category slices such as coding, politics, and finance.

### Added

- Added deterministic feed refresh support that recaptures visible X items, merges them into a source-scoped current working set, and re-renders an existing curated view from a mask without requiring the agent to manually merge old and new feed snapshots.
- Added local JavaScript standards scaffolding with `pnpm`, ESLint flat config, Prettier, and a local `.npmrc` `min-release-age=7` guard so the repo has explicit lint and formatting checks instead of relying only on ad hoc script validation.

### Changed

- Refactored the feed implementation from X-specific scripts into a modular source-adapter architecture with shared config, storage, merge, mask, and rendering modules, so additional platforms can plug into the same standardized JSON and HTML view pipeline.
- Changed feed curation to target stable item identities instead of positional row indexes, which keeps masks, grouped tabs, and refreshed views attached to the same underlying posts even when capture order changes between refreshes.
- Changed X capture to preserve meaningful line breaks in post bodies and to emit canonical item fields such as `id`, `source_item_id`, `author`, `content`, `stats`, and `thread`, reducing renderer coupling to platform-specific field names.
