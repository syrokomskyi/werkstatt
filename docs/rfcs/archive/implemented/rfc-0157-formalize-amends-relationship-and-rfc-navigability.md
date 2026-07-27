---
id: RFC-0157
title: "Formalize the amends relationship and RFC navigability"
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
  - RFC-0001
  - RFC-0008
  - RFC-0152
commands:
  proposed:
    - rfc.graph
    - rfc.index.generate
  added:
    - rfc.graph
    - rfc.index.generate
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel
successSignals:
  - "There is exactly one schema-sanctioned way to express 'this RFC partially modifies that one' — no ad-hoc frontmatter keys."
  - "An agent can answer 'what supersedes / amends / relates to RFC-X' without parsing every RFC file."
nonGoals:
  - "Do not re-open the supersede/superseded lifecycle (RFC-0001); amends is a weaker, non-terminal relationship."
  - "Do not require a heavy index.json that must be regenerated on every edit — rfc.list already parses on the fly."
---

# RFC-0157: Formalize the amends relationship and RFC navigability

## Context

The 2026-06 audit found two non-schema frontmatter keys carrying real meaning the current `RfcFrontmatter` cannot express:

- `amends: [RFC-0149]` on RFC-0152 — "partially modifies the image sub-decision of RFC-0149" (weaker than `supersedes`, which would wrongly retire 0149).
- `revisionHistory:` on RFC-0008 — a dated change log entry.

Both were intentionally retained by the audit (the validator ignores unknown keys), but a "clean" base should not depend on keys outside the schema. Separately, RFC-0001 deferred `rfc.index.generate` to a future RFC; with 138 RFCs and a now-consistent supersession/amends graph, agents and humans need a way to query relationships without reading every file.

## Decision

Two coupled additions:

1. **First-class `amends` / `amendedBy`.** Add `amends: string[]` and `amendedBy: string[]` to `RfcFrontmatter`, with the same bidirectional integrity rule as supersedes/supersededBy (validated by RFC-0153's V-12-style check) but **non-terminal**: an amended RFC keeps its status. Migrate RFC-0152's `amends` onto the formal field. Either add an optional `revisionHistory` array to the schema or relocate RFC-0008's entry into the body as a "## Revision history" note — pick one and apply consistently.
2. **`rfc.index.generate` + `rfc.graph`.** A command that emits a machine-readable index (`docs/rfcs/index.json` or stdout `--json`) of id, status, dates, and the supersedes/supersededBy/amends/related edges, plus a `rfc.graph` view that prints the supersession/amends chains for a given id.

## Acceptance criteria

- [x] `RfcFrontmatter` defines `amends` / `amendedBy` (+ templates); RFC-0152's `amends: [RFC-0149]` is the formal field, with `RFC-0149.amendedBy: [RFC-0152]`; the new V-19 rule validates it bidirectionally (non-terminal — 0149 stays `implemented`). (evidence: implemented historically)
- [x] RFC-0008's `revisionHistory` entry is relocated into the body ("## Revision history"); the new V-20 rule reports 0 unknown-frontmatter-key violations across the set (the old `scripts/rfc-audit.mjs` "stray-key" backstop is now retired). (evidence: implemented historically)
- [x] `rfc.index.generate` emits a stable machine-readable relationship index with `--json` (143 RFCs; `--write` persists `docs/rfcs/index.json`). (evidence: docs/ directory, documentation exists)
- [x] `rfc.graph RFC-XXXX` prints that RFC's supersedes/supersededBy/amends/amendedBy/related neighbours (verified on RFC-0152). (evidence: implemented historically)

## Implementation notes for agents

- `amends` is deliberately weaker than `supersedes`: it MUST NOT change the amended RFC's status. RFC-0152↔RFC-0149 is the canonical example (0149 stays implemented).
- Coordinate the bidirectional `amends`/`amendedBy` validation with RFC-0153 so the integrity rules live in one place.
- Closes backlog items B5/B6 in `docs/audits/2026-06-rfc-consistency-audit.md`.

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
