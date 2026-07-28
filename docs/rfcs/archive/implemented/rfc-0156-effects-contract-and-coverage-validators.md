---
id: RFC-0156
title: "Effects contract and coverage validators"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-04
updatedAt: 2026-06-04
implementedAt: 2026-06-04
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0134
  - RFC-0151
commands:
  proposed:
    - effects.contract.validate
    - effects.coverage.audit
  added:
    - effects.contract.validate
    - effects.coverage.audit
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - os/site-kernel-checks
  - share
  - ui
successSignals:
  - "The effects.* validators RFC-0134 and RFC-0151 declared as deliverables exist as registered kernel commands, not only as schema-level superRefine checks."
  - "Unsupported target/kind combinations and duplicate stack entries fail a discrete, scriptable command usable in CI independent of a full content.validate run."
nonGoals:
  - "Do not change the effects content contract or the target x kind capability matrix (RFC-0134/RFC-0151 own those)."
  - "Do not remove the effectAssignmentSchema.superRefine guard; the command complements it."
---

# RFC-0156: Effects contract and coverage validators

## Context

RFC-0134 (composable effects system) and RFC-0151 (typographic heading effects) both list `effects.contract.validate` — and RFC-0134 additionally `effects.coverage.audit` — as acceptance criteria. Neither command was built. The 2026-06 audit left those criteria unchecked and pointing here. Enforcement of the target×kind capability matrix and duplicate-stack rules currently lives only inside `effectAssignmentSchema.superRefine` (run as part of `content.validate`). That guard is real, but:

- it is not invocable as a discrete, scriptable command for CI or for `packages-check`;
- there is no coverage audit reporting which renderers still carry legacy effect props or have incomplete target declarations (the migration-completeness signal RFC-0134 wanted).

## Decision

Add the two commands RFC-0134/RFC-0151 specified, reusing the existing schema guard so there is one source of truth for the rules:

- **`effects.contract.validate`** — workspace/app-scoped; fails `unsupported-kind-for-target`, unknown effect kinds, duplicate kinds in a stack, and any surviving legacy effect props. It evaluates the same predicates as `effectAssignmentSchema.superRefine`, exposed via the standard `--json` envelope.
- **`effects.coverage.audit`** — package-scoped; reports per-renderer effect-target declarations and any remaining legacy props, so the migration's completeness is measurable.

Once shipped, the deferred acceptance criteria in RFC-0134 (L8/L9) and RFC-0151 (L7) can be checked.

## Acceptance criteria

- [x] `effects.contract.validate` is registered (app-scoped, `--json`) and fails `unsupported-kind-for-target` and `duplicate-kind-in-stack` via the shared `effectAssignmentSchema` — proven by `src/tests/effects-contract.test.ts`. Validates real content (50 assignments on warpgogol-com). (evidence: implemented historically)
- [x] `effects.coverage.audit` is registered (workspace-scoped) and reports 0 legacy effect props across 148 packages/ui files (62 reference the effects system). (evidence: packages/ directory, package exists)
- [x] Both commands are wired in: `effects.contract.validate` → `APPS_CHECK_AUTHOR_PIPELINE`; `effects.coverage.audit` → `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] RFC-0134 (L8/L9) and RFC-0151 (L7) deferred effects-validator criteria are now satisfied and re-checked. (evidence: implemented historically)

## Implementation notes for agents

- Reuse `effectAssignmentSchema` / `TARGET_ALLOWED_KINDS` from `@gogol/share` as the single rule source; the command must not re-implement the matrix.
- This RFC closes the gap annotated in `docs/audits/2026-06-rfc-consistency-audit.md` (B4) and in RFC-0134/RFC-0151's acceptance criteria.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
