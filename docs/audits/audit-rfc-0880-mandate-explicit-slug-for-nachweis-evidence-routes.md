---
rfcId: RFC-0880
auditId: AUDIT-RFC-0880-01
date: 2026-08-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0880

## Verdict: Needs revision

The RFC correctly identifies a real invariant gap (slug divergence causing build failures) and proposes a minimal validator check. However, it contains factual errors in file paths, an incomplete `packagesImpacted` list, and presents already-implemented behavior (resolvePageRoute synthetic ID mapping, no-slashes route format) as new requirements.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1 (FAIL)**: The "File system responsibilities" table lists the validator at `packages/werkstatt-site/src/checks/nachweis-validate.ts`. The actual path is `packages/werkstatt/src/nachweis/nachweis-validate.ts` (registered in `packages/werkstatt/src/nachweis/nachweis.module.ts:84`). The RFC's `packagesImpacted` also lists only `packages/werkstatt-site`, but the validator change is in `packages/werkstatt`. Both packages must be listed in `packagesImpacted`.

- **A-2 (FAIL)**: The `amends` array is empty (`amends: []`), but the "Architectural fit" section states "RFC-0708 (amended): Formalizes the slug contract that RFC-0708 left implicit." If this RFC amends RFC-0708, it must appear in the `amends` array. If it does not amend RFC-0708 (only formalizes an implicit contract without changing RFC-0708's text), the "amended" language should be removed from the body.

- **A-3 (WARN)**: Decision #3 ("Generated route paths must not contain leading or trailing slashes") and Decision #4 ("resolvePageRoute must handle synthetic Nachweis page IDs") are already implemented in the codebase:
  - `nachweis-routes.ts:129` already generates `nachweise/${slug}` (no slashes).
  - `resolve-route.ts:567-687` already extracts `nachweisDetailSlug` / `nachweisVerifySlug` from synthetic page IDs, maps them to `nachweis-detail` / `nachweis-verify` content templates, and injects the slug into block props.
  The RFC should acknowledge these as existing behavior being formalized, not as new changes requiring implementation. Acceptance criteria 3, 4, and 5 are already satisfied by the current code.

- **A-4 (PASS)**: All other sections (Decision, Design, Failure modes, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes) contain real content with no template placeholders.

## Axis B — DNA alignment

No issues. `satisfies: []` is appropriate for a `command` kind RFC. No DNA invariants are claimed or conflicted with.

## Axis C — Ecosystem fit

- **C-1 (PASS)**: Package boundaries are correct — route generator and list component are in `werkstatt-site`, validator is in `werkstatt`. Imports flow `packages → packages`, no boundary violations.

- **C-2 (PASS)**: Pipeline placement is correct — `NACHWEIS-SLUG-01` is emitted by `nachweis.validate`, which already runs in `SITES_BUILD_CHECK_PIPELINE` at `build-check.ts:28`.

- **C-3 (PASS)**: `commands.changed: [nachweis.validate]` is correct — the command is already registered and gains a new check.

## Axis D — Forward-only compliance

No issues. The RFC removes the fallback to file path derivation with no compatibility shim. Slug is mandatory for published records from the start — no grace period. This is forward-only.

## Axis E — Agent-facing policy

No issues. Standard implementation notes reference RFC-0224 for the accepted→implemented transition. No self-authorizing language. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

- **F-1 (PASS)**: The validator check is minimal — a single field presence test. No new command is proposed; the existing `nachweis.validate` command gains a check.

- **F-2 (WARN)**: `packagesImpacted` is incomplete — missing `packages/werkstatt` (see A-1).

## Axis G — Blind spots

- **G-1 (WARN)**: The RFC claims "All existing evidence records in warpgogol-com already have slug in frontmatter. No migration needed." This claim should be verified by scanning the actual evidence records before implementation. If any published record lacks `slug`, the validator will immediately block `build.check` for that site.

- **G-2 (WARN)**: The RFC says `data.slug` must be "a non-empty string" but the acceptance criterion and design do not specify whether an empty string (`slug: ""`) should be treated as absent. The validator check should explicitly test for both `undefined` and empty/whitespace-only strings.

- **G-3 (PASS)**: Edge cases for empty states (new app with no evidence records) are handled — the validator iterates over zero records without issue.

## Questions for the author

1. Should `amends` include `RFC-0708`, or should the "amended" language in the Architectural fit section be changed to "formalized" (no amendment)?
2. The `packagesImpacted` list is missing `packages/werkstatt` — the validator that gains `NACHWEIS-SLUG-01` lives there, not in `werkstatt-site`. Should both packages be listed?
3. Decisions #3 and #4 (no slashes, resolvePageRoute mapping) are already implemented in the codebase. Should the RFC acknowledge this and reframe them as formalizing existing behavior, or should the acceptance criteria be merged into the criteria for the actual new changes (validator + fallback removal)?
