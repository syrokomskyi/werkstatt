---
id: RFC-0161
title: "Reclassify the growth and cosmic-passport layers from DNA invariants to features"
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
amends:
  - RFC-0027
  - RFC-0028
amendedBy: []
related:
  - RFC-0027
  - RFC-0028
  - RFC-0158
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - growth
  - star-map
  - nebula
  - passport
successSignals:
  - "The growth and cosmic-passport capabilities can evolve or be dropped per product priority without a superseding architecture RFC — they are features, not non-negotiable DNA."
  - "The DNA registry no longer claims a binding invariant (e.g. 'every build emits a signed cosmic passport') that the live apps do not satisfy."
nonGoals:
  - "Do not delete or renumber DNA-27..34 — they remain stable numbered anchors so existing related[] references resolve."
  - "Do not reclassify DNA-23 (cosmic naming / catalogs) — it is load-bearing for every manifest and stays a binding invariant."
  - "Do not remove the growth/cosmic packages or pages; this is a governance reclassification, not a teardown."
---

# RFC-0161: Reclassify the growth and cosmic-passport layers from DNA invariants to features

## Context

The 2026-06 DNA liveness review (follow-up to the RFC consistency audit and RFC-0158) found that the growth layer (DNA-27..30 — event catalog, funnels, experiments, `GrowthAdapter`) and the cosmic-passport layer (DNA-31..34 — Cosmic Passport, Star Map, Nebula Score, VC signing) are **authored but not active**: the packages and pages exist, but `release.passportEnabled` is set in **0** of the two live apps, `growth.funnels.validate` is **not registered**, and these enforcers are largely not in `build.check`. So DNA-31's absolute claim — "_every build of every app emits `dist/.well-known/cosmic-passport.json`_" — is simply false today. These were elevated to "DNA" (non-negotiable invariants requiring a superseding RFC to weaken) prematurely. The studio's actual priority is the **client-site delivery pipeline** (thin apps, onboarding, headless-CMS), which the foundational and section/content/i18n DNA already serve.

## Decision

DNA-27..34 are **reclassified from binding DNA invariants to feature-level capabilities**, governed by their feature RFCs — RFC-0027 (growth) and RFC-0028 (cosmic passport) — which this RFC `amends`. Concretely:

- Each of DNA-27..34 keeps its numbered anchor in `docs/architecture-dna.md` (no renumber, so existing `related[]` references still resolve) but carries an explicit **"Reclassified to feature (RFC-0161)"** status line.
- These capabilities **may be evolved, deferred, or removed by an ordinary feature RFC** — they no longer require a superseding _architecture_ RFC, and weakening them is not an Anti-Pattern.
- `dna.registry.validate` (RFC-0158) treats reclassified entries as exempt from the DNA-REG-05 enforcement check — a feature need not have a live, pipelined enforcer.
- **DNA-23 (cosmic naming / closed catalogs) is NOT reclassified** — `cosmicName` is load-bearing for every `manifest.yaml` and stays a binding invariant. Only the passport/star-map/nebula/growth _capability_ layers move.

## Acceptance criteria

- [x] DNA-27..34 in `docs/architecture-dna.md` carry a "Reclassified to feature (RFC-0161)" status line; their numbers are unchanged and `related[]` references still resolve (`rfc.validate` V-18 green). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `dna.registry.validate` exempts reclassified entries from the DNA-REG-05 enforcement-command check. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] RFC-0027 and RFC-0028 record `amendedBy: [RFC-0161]` (bidirectional `amends`, validated by V-19). (evidence: implemented historically)
- [x] DNA-23 remains a binding invariant (not reclassified). (evidence: docs/architecture-dna.md:1, DNA invariants documented)

## Implementation notes for agents

- A reclassified DNA is a **feature**: you MAY change or remove it via a normal feature RFC; you do not need a superseding architecture RFC, and `client.edit.validate` / Anti-Patterns do not protect it as an invariant.
- Do not reuse DNA-27..34's numbers for new invariants — new DNA continues at DNA-39+.
- If the studio later prioritises the cosmic/growth layer again, a feature RFC can re-promote a specific item to a binding invariant by removing its reclassification status line and wiring a real enforcer (DNA-REG-05 will then require it).

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
