---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 3bc216eff...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/content-references.ts
  - packages/os/site-kernel-checks/src/tests/content-references.test.ts
  - packages/os/site-kernel-codegen/src/content-formula-migrate.ts
  - packages/share/src/tests/formula-eval.test.ts
  - packages/share/AGENTS.md
---

# Code Review: RFC-0723 implementation (3bc216eff...HEAD)

## Verdict: Needs revision

The implementation correctly promotes REF-04 to an error and extends the migrator with a second scan pass. Two findings require attention: a duplicated `BRACELESS_PATTERN` regex that diverges from the canonical pattern in `@warpgogol/share`, and a duplicated `loadIndex` helper that could reuse the existing `loadContentRefIndex` export.

## Mechanical floor

Pass — `build:check` passes for all three affected packages; 881 tests pass in `site-kernel-checks`, 274 tests pass in `share`.

## Axis A — Structural correctness

- **Duplicated Code (finding A-1):** `BRACELESS_PATTERN` is defined identically in both `packages/os/site-kernel-checks/src/content-references.ts:51` and `packages/os/site-kernel-codegen/src/content-formula-migrate.ts:39`. The canonical scan pattern lives in `packages/share/src/content-reference.ts:43` as `BRACELESS_SCAN_PATTERN`. The codegen copy uses `[a-zA-Z0-9_.-]+` for the field path segment, which greedily matches trailing sentence punctuation periods — the same bug documented in the system-retrieved memory about `BRACELESS_SCAN_PATTERN` (fixed in share to `[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*`). The codegen pattern should be updated to match the fixed share pattern or, ideally, exported from share and imported.

- **Duplicated Code (finding A-2):** `loadIndex` in `packages/os/site-kernel-codegen/src/content-formula-migrate.ts:41-51` duplicates `loadContentRefIndex` in `packages/share/src/content-reference.ts:58-69`. The share version is already exported and tested. The codegen version reimplements the same logic (read file, parse YAML, check version/entries). Should import `loadContentRefIndex` from `@warpgogol/share/content-reference` instead.

## Axis B — DNA alignment

No issues. The diff aligns with DNA-4 (canonical content in `src/content/`) and DNA-24 (block-declarative pages) as declared in the RFC `satisfies` field.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct: codegen imports from share via subpath exports. The `@warpgogol/share/content-reference` subpath export already exists in `packages/share/package.json:62-65`.

## Axis D — Forward-only compliance

No issues. REF-04 is promoted directly from warning to error — no dual-path or grace period.

## Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are updated in both modified source files. Test names clearly reference RFC-0723.

## Axis F — Pragmatism

- **Finding F-1 (related to A-1):** The `BRACELESS_PATTERN` in `content-formula-migrate.ts:39` uses the old field path pattern `[a-zA-Z0-9_.-]+` instead of the fixed `[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*`. This means the migrator could match trailing periods in sentence-final references, producing `=(ref.)` instead of `=(ref)`. This is the same class of bug that was fixed in share. The migrator should use the same pattern.

## Axis G — Blind spots

- **Finding G-1:** The migrator's second scan pass does not skip references inside YAML frontmatter (between `---` delimiters). If a frontmatter value contains a pattern matching `collection.file.field`, the migrator would wrap it in `=(...)`, which is incorrect — `=(...)` is content-reference syntax only, not YAML syntax. The RFC explicitly states this in implementation notes (line 286). The first pass (`HARDCODED_FORMULA_PATTERN`) also has this blind spot, so this is pre-existing, but the second pass increases exposure.

## Spec compliance

| Requirement from RFC-0723 | Status | Evidence |
| --- | --- | --- |
| Promote REF-04 to error for known collections | Done | `content-references.ts:152-161` |
| Skip REF-04 inside =(…) formulas | Done | `content-references.ts:144-151` |
| Migrator wraps bare braceless refs in mixed strings | Done | `content-formula-migrate.ts:105-138` |
| Migrator is idempotent | Done | Re-running produces 0 conversions |
| Migrator skips refs inside =(…) | Done | `content-formula-migrate.ts:118-122` |
| Migrator skips pure refs | Done | `content-formula-migrate.ts:124-128` |
| Migrator skips unknown collections | Done | `content-formula-migrate.ts:130-134` |
| Unit tests for resolveFormula string return | Done | `formula-eval.test.ts:235-301` (3 tests) |
| Unit tests for REF-04 promotion + isInsideFormula | Done | `content-references.test.ts` (3 tests) |
| AGENTS.md rule | Done | `AGENTS.md:518-520`, `packages/share/AGENTS.md:35` |
| RFC-0529.amendedBy updated | Done | `rfc-0529...md:21-22` |
| Content migration on warpgogol-com | Done | 36 conversions, 0 remaining warnings |

## Questions for the author

1. Should `BRACELESS_PATTERN` in `content-formula-migrate.ts` use the fixed field path pattern from share (`[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*`) to avoid matching trailing periods in sentence-final references?
2. Should `loadIndex` in `content-formula-migrate.ts` be replaced with `loadContentRefIndex` from `@warpgogol/share/content-reference` to eliminate duplication?
3. Should the migrator skip YAML frontmatter delimiters to avoid wrapping patterns inside frontmatter values?
