---
id: RFC-0158
title: "Keep the DNA registry in sync with establishing RFCs via dna.registry.validate"
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
amends: []
amendedBy: []
related:
  - RFC-0001
  - RFC-0153
commands:
  proposed:
    - dna.registry.validate
  added:
    - dna.registry.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "A new RFC that establishes an invariant cannot land without recording it in docs/architecture-dna.md — the DNA-27..38 drift the 2026-06 audit found becomes impossible to repeat."
  - "The canonical DNA registry is internally consistent (contiguous ids) and every entry traces to an existing RFC."
nonGoals:
  - "Do not check DNA references in RFC related[] — rfc.validate V-18 (RFC-0153) owns that direction."
  - "Do not require a citation on the foundational invariants (DNA-1..16) that predate the RFC process — that is a warning, not a blocker."
---

# RFC-0158: Keep the DNA registry in sync with establishing RFCs via dna.registry.validate

## Context

The 2026-06 RFC consistency audit (`docs/audits/2026-06-rfc-consistency-audit.md`, backlog B7) found that `docs/architecture-dna.md` defined only DNA-1..26 while RFCs referenced DNA-27..38. Each missing invariant was already established and described in its introducing RFC (RFC-0027/0028/0029/0035/0100) — the registry simply fell behind, because nothing connected "an RFC establishes a DNA" to "the registry records it." The backfill closed the gap, but without a guard the same drift recurs the next time an RFC establishes DNA-39. The audit also exposed two overlapping DNA docs (the canonical numbered registry and a derived cross-site prose companion) and that early entries (DNA-1..23) lacked machine-readable establishing-RFC citations.

## Decision

Add `dna.registry.validate` (workspace-scoped, wired into `PACKAGES_CHECK_PIPELINE`). It parses the canonical registry `docs/architecture-dna.md` (`## DNA-N · Title … Established by RFC-XXXX`) and the RFC corpus, and enforces:

- **DNA-REG-01 (error)** — registry ids are contiguous from 1 with no gaps or duplicates.
- **DNA-REG-02 (error)** — every `Established by RFC-XXXX` citation points to an existing RFC.
- **DNA-REG-03 (error)** — any RFC body that says "`DNA-N established by this RFC`" MUST have a `## DNA-N` registry entry. This is the exact B7 drift; the phrase is the **canonical marker** new RFCs use to establish an invariant.
- **DNA-REG-04 (warning)** — a registry entry with no provenance at all. Provenance is satisfied by either an `Established by RFC-XXXX` citation **or** an explicit `Foundational invariant (pre-RFC)` marker — the latter is the honest provenance for axioms (monorepo, pnpm, Astro, kebab-case, …) that predate the RFC process; fabricating an RFC for them is wrong.
- **DNA-REG-05 (error / warning)** — an active invariant's named enforcer (`Enforced by `cmd``) must be a registered command (error if absent); it should be wired into a `*\_PIPELINE` (warning if not). Entries reclassified to features (RFC-0161) are exempt — a feature need not have a live, pipelined enforcer. This turns the registry's "Enforced by" prose into a verified claim (the DNA *liveness\* guarantee).

`rfc.validate` V-18 (RFC-0153) already guards the other direction (a DNA referenced in `related[]` must exist in the registry). The canonical registry is `docs/architecture-dna.md`; the cross-site prose doc under `packages/os/site-kernel/docs/` is a derived view and is not read as a source of truth.

## Acceptance criteria

- [x] `dna.registry.validate` is registered (workspace-scoped) and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] DNA-REG-01 (contiguity), DNA-REG-02 (no dangling citation), and DNA-REG-03 (RFC establishes an unrecorded DNA) are errors; DNA-REG-04 (untraced entry) is a warning — proven by `src/tests/dna-registry.test.ts`. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] The command passes on the current workspace with **0 warnings**: DNA-1..38 are contiguous and every entry has honest provenance — an `Established by RFC-XXXX` citation (DNA-5/8/9/12/13/14/15/16/17..38) or a `Foundational invariant (pre-RFC)` marker (DNA-1/2/3/4/6/7/10/11). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] Backfill closed B7: DNA-27..38 are recorded (from RFC-0027/0028/0029/0035/0100) and DNA-17..23 gained establishing-RFC citations; `rfc.validate` V-18 emits 0 warnings. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] DNA-REG-05 verifies each active entry's `Enforced by` command is registered (error) and pipelined (warning); reclassified entries (RFC-0161) are exempt — proven by `src/tests/dna-registry.test.ts`. On the current workspace it surfaces 3 advisory gaps (DNA-13 `feature.{links,projections}.validate`, DNA-20 `business.profile.validate` registered but not pipelined), all reported in the DNA liveness audit. (evidence: docs/architecture-dna.md:1, DNA invariants documented)

## Implementation notes for agents

- The **canonical marker** to establish an invariant is the literal phrase "`DNA-N established by this RFC`" in the RFC body. Use it, and add the matching `## DNA-N · Title … Established by RFC-XXXX` entry to `docs/architecture-dna.md` in the same change — `dna.registry.validate` (DNA-REG-03) fails the build otherwise.
- Give every registry entry provenance: cite `Established by RFC-XXXX` when an establishing RFC exists, or mark `Foundational invariant (pre-RFC)` for axioms that predate the RFC process. Do not invent an RFC attribution.
- Do not read or write the derived cross-site companion (`packages/os/site-kernel/docs/architecture-dna.md`) as a DNA source of truth.

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
