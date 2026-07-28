---
id: RFC-0154
title: "Build must not mutate tracked business content"
status: implemented
kind: policy
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
  - RFC-0042
  - RFC-0087
  - RFC-0135
commands:
  proposed:
    - content.idempotency.validate
  added:
    - content.idempotency.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - os/site-kernel-checks
  - os/site-kernel-onboarding
successSignals:
  - "A clean `pnpm build` leaves the git working tree clean — no tracked content file under apps/*/src/content/business/** is rewritten."
  - "NEED_THIS_* markers survive a build; the legal/data gate (semantic.page.validate) cannot be silently defeated by a build that blanks them."
nonGoals:
  - "Do not change how legal/business data is authored or what the NEED_THIS_* markers mean (RFC-0042)."
  - "Do not forbid generators from writing GENERATED files — only tracked, hand-authored business content is protected."
---

# RFC-0154: Build must not mutate tracked business content

## Context

During the 2026-06 audit it was observed (and recorded in the ecosystem-findings notes) that a plain `pnpm build` rewrites tracked, hand-authored business content. On `apps/warpgogol-com` the build replaced `NEED_THIS_*` markers in `src/content/business/de/{legal,company}.md` with real values for some fields and **blanked others to `""`**. Two invariants break:

1. **Build idempotency / clean tree.** A build must be a pure function of the source tree; it must not modify tracked inputs. A dirty tree after `build` hides real diffs and breaks CI clean-tree checks.
2. **The legal-data safety gate.** `semantic.page.validate` relies on the presence of `NEED_THIS_*` markers to fail production builds when mandatory legal fields (Steuernummer, IBAN, Impressum address, …) are still unfilled (RFC-0042). A build step that **blanks** a marker to `""` removes the very signal the gate checks → missing legal data could pass silently. For a studio shipping client sites this is a compliance risk, not a cosmetic bug.

The mutating step is some build prepare/amend/sync that pulls from a brief/identity source; it is most likely tied to the amend-onboarding pipeline (RFC-0135/0136). It must be identified and constrained.

## Decision

Building a site MUST NOT modify any tracked file under `apps/*/src/content/business/**` (nor any other hand-authored, non-`GENERATED` content). Specifically:

- Identify the prepare/sync/amend step that mutates business content and make it **read-only at build time** — any business-data population happens through an explicit, opt-in onboarding/amend command (RFC-0135), never as a side effect of `build`.
- A marker that is unresolved stays `NEED_THIS_*`; a build may never replace it with `""`.
- Add `content.idempotency.validate` (run in CI / `build.check`): runs the prepare pipeline, then fails if `git status --porcelain` reports changes to tracked content paths.

## Acceptance criteria

- [x] The build step that rewrites `apps/warpgogol-com/src/content/business/de/{legal,company}.md` is identified and no longer runs during `build`. — investigation finding: **no current `APPS_BUILD_PREPARE_PIPELINE` step mutates `src/content`** (verified: `build.prepare` on warpgogol-com leaves the business tree byte-identical, 0 changes). The 2026-06-02 observation is not reproducible via the standard build — it was amend-pipeline-specific or already fixed. There is no current build-time mutator to remove; the guard below prevents regression. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] A clean `build.prepare` followed by a `src/content/**` snapshot reports no changes — proven by `content.idempotency.validate` passing on warpgogol-com. (evidence: implemented historically)
- [x] No build path may replace a `NEED_THIS_*` marker with an empty string; `content.idempotency.validate` flags marker removal as CRITICAL, and `semantic.page.validate` (unchanged) still fails production builds on unresolved markers. (evidence: implemented historically)
- [x] `content.idempotency.validate` is registered (app-scoped): snapshots `src/content/**`, runs `APPS_BUILD_PREPARE_PIPELINE` once, and exits non-zero on any authored-content change. Opt-in for CI (it runs the full prepare pipeline), mirroring `pipeline.idempotency.smoke`'s design — it is the complementary guard the latter misses (smoke only proves pass-1 ≡ pass-2, so an identical-every-run mutation would slip through). (evidence: implemented historically)

## Implementation notes for agents

- Start from the amend-onboarding pipeline (RFC-0135/0136) and `system-md`/business sync steps — the most likely mutators per the 2026-06 ecosystem-findings notes.
- Treat blanking a marker to `""` as the highest-severity failure mode: it defeats a legal safety gate, unlike merely filling a real value.
- This is a `policy` RFC: the durable rule is "build never mutates tracked authored content"; the validator is the enforcement.

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
