# Browser Runtime Refactor

## Goal

Replace large hand-written per-source extraction script strings with a
shared browser-runtime helper layer plus thin source-specific extractor
bodies.

The immediate goal is not a full framework. The goal is to remove the
most duplicated browser-side helpers while keeping the current adapter
boundaries and persistence/render pipeline intact.

## Problems in the current model

- Each source embeds its own browser-side helper functions inside a
  template string.
- Common helpers such as `textOf`, `multilineTextOf`, `linesOf`,
  count normalization, and absolute URL construction drift across
  sources.
- Browser-side extraction code is harder to lint and refactor because it
  is authored as large string literals instead of composed code.
- Source adapters duplicate scrolling/extraction patterns even when the
  runtime concerns are shared.

## Hard-cut design

### Shared browser runtime

Create `sources/browser-runtime/` with browser-safe helper functions
that are serialized into the page context.

The first cut should include:

- `textOf`
- `multilineTextOf`
- `linesOf`
- `normalizeCount`
- `makeAbsoluteUrl`
- `toBrowserFunctionSource`
- `buildBrowserRuntimeScript`

This is enough to remove the most repeated low-level helper logic across
the current script-based sources.

### Source extractor body

Each source keeps a `buildExtractionScript(limit)` function, but instead
of embedding all helpers directly it should compose:

- shared browser runtime prelude
- source-local helper functions only
- source-specific extraction body

That preserves the current execution model while reducing duplication.

### Contracts

Keep the existing persisted feed item/document contract unchanged.

The browser runtime only helps construct the browser-side extraction
script. The shared Node-side normalization, merge, persistence, asset
download, and render layers remain the authoritative boundaries.

## Migration strategy

### Phase 1

Migrate the script-based sources that already share the most duplicated
helper logic:

- `x`
- `bluesky`
- `tiktok`
- `instagram`
- `linkedin`

Facebook keeps its snapshot parser model and does not need to move onto
the browser-runtime helper layer.

### Phase 2

After the shared helper layer is proven stable:

- factor shared extraction-family helpers for container feeds
  (`instagram`, `linkedin`)
- factor shared extraction-family helpers for hydration-first feeds
  (`tiktok`)
- factor shared extraction-family helpers for status feeds
  (`x`, `bluesky`)

That second phase should only happen where the deduplication reduces
complexity rather than hiding source-specific behavior.

## Non-goals in this cut

- no dynamic module loader inside the browser page
- no compatibility wrapper layer around old and new extraction paths
- no renderer or persistence redesign
- no speculative source-family abstractions beyond the common low-level
  helper layer

## Acceptance criteria

- Shared browser helper functions live in one place
- Script-based sources reuse them instead of embedding duplicate helper
  definitions
- Existing normalized output shape remains unchanged
- Lint/tests/knip remain green
- Live smoke capture still works for the actively used sources
