# Brooks Debt Assessment - 2026-06-22

Mode: Tech Debt Assessment
Scope: Entire repository on the Brooks remediation stack.
Initial Health Score: 70/100

Overall verdict: feed_tools has a healthy command split, but browser extraction scripts and feed rendering/merge paths still concentrate too many DOM and presentation decisions in long functions.

## Findings

### Warning

**Cognitive Overload - render HTML and item merge helpers carried multiple responsibilities [quick-fix]**
Symptom: `lib/render/html.ts` and `lib/merge.ts::mergeItem` mixed layout assembly, nested-field precedence, identity preservation, and capture bookkeeping.
Source: Fowler - Refactoring: Long Method; Ousterhout - information hiding.
Consequence: A source-shape change could accidentally alter merge precedence or UI output.
Remedy: PR 75 splits render HTML helpers; stack 2 extracts nested merge helpers for author, stats, and thread fields.

**Change Propagation - source capability knowledge was duplicated across registry and callers [guided]**
Symptom: source support decisions appeared in source catalog callers and manifest-like data.
Source: Hunt and Thomas - DRY; Brooks - conceptual integrity.
Consequence: Adding a platform required edits in several command surfaces.
Remedy: Existing source-manifest ownership work centralizes source catalog data; keep new source metadata in the manifest boundary.

**Cognitive Overload - browser extraction scripts are large inline DOM programs [manual]**
Symptom: `sources/*/capture.ts::buildExtractionScript` functions are 150-388 lines because they emit browser-side extraction code.
Source: McConnell - Code Complete: routine length; Feathers - characterization tests.
Consequence: Platform DOM changes are hard to review and can silently alter extraction behavior.
Remedy: Defer to source-by-source characterization tests before splitting generated browser scripts.

## Debt Summary

| Risk                    | Findings | Avg Priority | Classification | Intent     |
| ----------------------- | -------: | -----------: | -------------- | ---------- |
| Cognitive Overload      |        2 |          5.0 | Scheduled      | accidental |
| Change Propagation      |        1 |          4.0 | Scheduled      | accidental |
| Knowledge Duplication   |        0 |          0.0 | Monitored      | n/a        |
| Accidental Complexity   |        0 |          0.0 | Monitored      | n/a        |
| Dependency Disorder     |        0 |          0.0 | Monitored      | n/a        |
| Domain Model Distortion |        0 |          0.0 | Monitored      | n/a        |

Recommended focus: keep extraction-script splits source-specific and protected by fixture tests.

## Remediation Stack

- Stack 1: `codex/brooks-debt-20260622-feed-tools-1`, PR 75, splits render HTML helpers.
- Stack 2: `codex/brooks-debt-20260622-feed-tools-2`, extracts nested merge-field helpers and records this assessment.

Estimated final score after both stacks: 82/100. Remaining risk is browser extraction-script complexity.
