---
id: RFC-0278
title: "Establish graduated PSEO autonomy levels and typed approval authority"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0197
  - RFC-0215
  - RFC-0218
  - RFC-0224
  - RFC-0271
  - RFC-0272
  - RFC-0273
  - RFC-0274
  - RFC-0276
  - RFC-0277
  - RFC-0279
  - RFC-0282
  - RFC-0283
  - RFC-0285
commands:
  proposed:
    []
  added:
    - autonomy.level.validate
    - autonomy.level.report
    - autonomy.promote
    - autonomy.demote
  changed:
    - surface.artifact.ready
    - surface.translation.validate
    - pseo.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/surface"
  - "@gogol/share"
successSignals:
  - "Every approval in the PSEO lifecycle is stamped with a typed approver identity that is either a human or a specific pinned agent."
  - "Each (module × field-class × locale) scope carries an explicit autonomy level from L0 (human approves all) to L4 (agent approves all, human samples on escalation only)."
  - "A scope earns a higher autonomy level only from recorded calibration evidence, and is automatically demoted when defects appear."
  - "Removing a human from a loop is a governed, reversible state transition with an audit trail, not a code edit."
nonGoals:
  - "Do not remove human review from any scope on day one; L0/L1 remain the starting posture."
  - "Do not define the AI reviewer mechanism itself; RFC-0279 specifies the agent that can hold approval authority at L2+."
  - "Do not call an LLM during normal deterministic build; autonomy governs generation/review passes, not SSG."
  - "Do not let any scope reach an autonomy level that structurally removes the RFC-0283 circuit-breaker or RFC-0282 observation loop."
---

# RFC-0278: Establish graduated PSEO autonomy levels and typed approval authority

## Context

RFC-0271 through RFC-0277 build a disciplined PSEO lifecycle: module contexts, artifact readiness, derived translations, translator notes, evidence and duplicate gates, a mission ledger, and a managed-visibility governance frame. Every one of those RFCs encodes a permanent human gate — `requireHumanApproval: true`, "claims fields always human", "first N artifacts full human review", "do not use an LLM as the indexability judge".

Those gates are correct as a _starting posture_. They are wrong as a _terminal design_. The platform's stated destination is a fleet of thousands of sites, over a decade horizon, operated predominantly by AI. A system whose safety depends on a human reviewing each artifact cannot reach that destination: RFC-0277 §B6 already identifies review throughput — not compute — as the true scaling ceiling. If the human gate is permanent, the ceiling is permanent.

The missing architecture is the **trajectory**: a governed, evidence-based path that starts with humans approving everything and converges, scope by scope, on AI approving everything — without ever betting correctness on an unproven leap.

## Problem

Today "approved" is a single boolean with an implicit human behind it:

- `provenance.approved: true` (RFC-0197) does not record _who_ or _what_ approved, or _by what authority_;
- RFC-0272's `reviewedBy: human:operator` hard-codes that a reviewer is human;
- there is no representation of "this scope is now trusted enough for an agent to sign off";
- there is no mechanism to _earn_ that trust from measured agreement between agent judgments and human judgments;
- there is no automatic _demotion_ when an autonomous scope starts producing defects;
- consequently the only way to remove a human from a loop is to edit code and hope — the opposite of a governed, auditable, reversible transition.

Without a typed approval authority and a level ladder, "move to AI-only" is a slogan, not a controllable system property.

## Decision

The platform gains a **graduated autonomy model** with two coupled primitives.

**1. Typed approval authority.** Every lifecycle transition that today writes `approved` now records a typed `Approver`:

- `human:<handle>` — a person, or
- `agent:<modelId>@<promptId>@<version>` — one specific, pinned reviewing agent (RFC-0279).

An approver is only _permitted_ to sign a given transition if the scope's current autonomy level authorizes that approver class for that field-class. An agent approval written above the scope's sanctioned level is a validation error, not a silent pass.

**2. Autonomy levels per scope.** The unit of autonomy is a **scope** = `(module × field-class × locale)`. Field-classes are risk tiers, not individual fields:

| Field-class | Examples | Ceiling policy |
| --- | --- | --- |
| `structural` | headings, teasers, block order, internal links | may reach L4 |
| `narrative` | Bedarfskarte prose, hub intros | may reach L4 |
| `claims` | prices, dates, certifications, "Meisterbetrieb", legal references | capped at L3 by default; UWG risk |
| `product` | customer-facing PSEO packaging language (RFC-0277) | capped at L3 by default |

Levels:

| Level | Who may approve | Human role |
| --- | --- | --- |
| L0 | human only | approves every artifact |
| L1 | human only, but agent pre-screens and auto-rejects | approves what passes pre-screen |
| L2 | agent may approve _low-risk_ items; human approves the rest and audits a sample | reviewer of exceptions + sampler |
| L3 | agent approves by default; human reviews only escalations + a shrinking random sample | escalation handler |
| L4 | agent approves all; no human in the default loop; RFC-0283 circuit-breaker + RFC-0282 observation remain | supervises the machine, not the artifact |

"AI-exclusive" is precisely **L4 across all field-classes that policy permits to reach it**. It is a reachable state, not the default one. Even at L4 the human is not removed from the _system_ — only from the _per-artifact loop_; sampling, the circuit-breaker (RFC-0283), and observability (RFC-0282) are structural and cannot be switched off by reaching L4.

## Architectural fit

- RFC-0197's freeze-approve mechanism is **reused unchanged**; this RFC only makes the _approver identity and its authority_ first-class. The mechanism (freeze, review, render only approved) is orthogonal to who holds the pen.
- RFC-0272's lifecycle states (`draft → approved → readyForTranslation → …`) are unchanged; each transition now carries an `Approver` and is checked against the scope level.
- RFC-0224's status-transition policy is the template: some transitions are agent-permitted under stated conditions, others are human-only, and the boundary is data, not lore. This RFC generalizes that idea from RFC lifecycle to content lifecycle.
- RFC-0279 supplies the AI reviewer that can be an `agent:` approver at L2+.
- RFC-0282 supplies the outcome signal that promotes/demotes levels; RFC-0283 supplies the safety floor that makes any level ≥ L2 acceptable.
- RFC-0285 governs the human escalation queue that L2–L4 route into.

## Design

### TypeScript contracts

```ts
export type Approver =
  | { kind: "human"; handle: string }
  | { kind: "agent"; modelId: string; promptId: string; version: string };

export type FieldClass = "structural" | "narrative" | "claims" | "product";
export type AutonomyLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export interface AutonomyScope {
  module: string;        // e.g. "pseo"
  fieldClass: FieldClass;
  locale: string;        // e.g. "de"
}

export interface AutonomyState {
  scope: AutonomyScope;
  level: AutonomyLevel;
  ceiling: AutonomyLevel;           // policy-imposed maximum (claims/product capped)
  sinceAt: string;                  // when the level last changed
  evidenceRef: string;             // pointer to the calibration record that justified it
  lastReviewedBy?: Approver;
}

/** Stamped on every lifecycle transition (extends RFC-0197 provenance). */
export interface ApprovalRecord {
  approver: Approver;
  atLevel: AutonomyLevel;           // level in force when the approval was written
  approvedAt: string;
  confidence?: number;             // agent self-confidence, when approver.kind === "agent"
}
```

### Earning a level (promotion) and losing it (demotion)

Promotion is **evidence-gated**, never manual optimism. `autonomy.promote` refuses to raise a scope unless a calibration record proves, over a rolling window:

| Metric | Meaning | Default promotion bar |
| --- | --- | --- |
| `agentHumanAgreement` | share of agent verdicts a human sampler upheld | ≥ 0.97 over ≥ N items |
| `defectEscapeRate` | approved items later flagged by RFC-0282/RFC-0283 or human erratum | ≤ configured ppm |
| `calibrationN` | labelled comparisons available for the scope | ≥ per-level minimum |
| `windowDays` | observation length | ≥ per-level minimum |

Demotion is **automatic and fast** — the "trust thermostat". Any of these drops a scope one or more levels immediately and appends an RFC-0276 Bordbuch event:

- a human erratum overturns an `agent:` approval;
- RFC-0283 fires a circuit-breaker on pages from the scope;
- RFC-0282 reports duplicate-footprint or index-collapse traceable to the scope;
- a claims-class defect is found (always demotes claims to L0 and opens an escalation).

Promotion is slow and earned; demotion is instant and cheap. This asymmetry is the whole safety argument: autonomy only ratchets up under proof, and falls back the moment proof is contradicted.

### CLI surface

```sh
pnpm exec site-kernel run autonomy.level.report   --app warpgogol-com --module pseo --json
pnpm exec site-kernel run autonomy.level.validate  --app warpgogol-com --json
pnpm exec site-kernel run autonomy.promote --app warpgogol-com --scope pseo/narrative/de --to L2
pnpm exec site-kernel run autonomy.demote  --app warpgogol-com --scope pseo/claims/de   --to L0 --reason "claims defect"
```

`autonomy.promote` is itself governed: it fails unless the calibration evidence meets the bar for the requested level, so even the act of granting autonomy is not a matter of asserting it.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/content/system.md` (`surface.modules.*.autonomy`) | Declares per-scope ceilings and starting levels |
| `apps/<app>/src/surface/autonomy.state.json` | Generated current levels + evidence pointers |
| `apps/<app>/src/surface/autonomy.calibration.ndjson` | Append-only agent-vs-human comparison log |

### Validation rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AUTO-01` | error | An `agent:` approval exists on a scope whose level does not authorize agent approval |
| `AUTO-02` | error | A level exceeds its policy ceiling (e.g. claims at L4) |
| `AUTO-03` | error | A promotion has no backing calibration record meeting the bar |
| `AUTO-04` | warning | A scope is eligible for promotion (evidence bar met) but still at a lower level |
| `AUTO-05` | error | An `ApprovalRecord` lacks `atLevel`, or an agent approval lacks `confidence` |
| `AUTO-06` | error | A demotion trigger fired but the level was not lowered |

## Failure modes

- Agent approves a claims field at a scope capped at L3 with a human still required: `AUTO-01`/`AUTO-07` error; the artifact is not renderable.
- Promotion requested without evidence: `autonomy.promote` exits non-zero; level unchanged.
- Demotion trigger fires mid-flight: level drops, affected approved artifacts revert to `draft`/re-review, Bordbuch records the cause.
- Calibration log missing for a scope claiming L2+: `AUTO-03` error; the scope is treated as L0 until evidence exists.
- Provider/reviewer unavailable at L3/L4: generation pauses; already-approved frozen content stays buildable (no live LLM in SSG).

## Rollout

1. Add `Approver`, `AutonomyLevel`, `AutonomyScope`, `AutonomyState`, `ApprovalRecord` types and stamp them onto RFC-0197/RFC-0272 provenance (all existing artifacts backfill as `human:` at `L0`).
2. Register `autonomy.level.validate`/`report` in report-only mode; wire `AUTO-01..06` as warnings first.
3. Declare per-scope ceilings in `warpgogol-com` system.md; every scope starts L0.
4. Once RFC-0279's reviewer exists, enable L1 pre-screen, then open L2 promotion for `structural`/`narrative` where calibration passes.
5. Promote `claims`/`product` no higher than their ceiling; keep the demotion thermostat authoritative.
6. Treat "all permitted scopes at L4" as the measurable definition of the AI-exclusive milestone, reported by `autonomy.level.report`.

## Alternatives considered

- **Keep `approved: boolean` and add a config flag "aiApproves".** Rejected: a flag is not evidence; it flips trust without measuring it and cannot demote itself.
- **One global autonomy setting per site.** Rejected: claims and structural blocks carry different risk; German legal copy cannot share a dial with teaser grids.
- **Jump straight to AI-only and rely on the circuit-breaker.** Rejected: the breaker (RFC-0283) is a floor for damage, not a substitute for earned calibration; unproven autonomy would trip it constantly.
- **Never remove humans (Fable's terminal stance).** Rejected as the _terminal_ design: it is the correct L0/L1 posture but contradicts the fleet-scale, decade-horizon goal; this RFC keeps Fable's caution as the _starting_ point of a governed climb.

## Risks

- **Calibration gaming:** an agent could be tuned to agree with humans without being correct. Mitigation: agreement is measured against _outcomes_ (RFC-0282) and errata, not only against the sampling human; judge ≠ generator (RFC-0279).
- **Silent ceiling drift:** a future edit raises a ceiling for convenience. Mitigation: `AUTO-02` is an error and ceilings live in reviewed system.md, recorded in Bordbuch.
- **Thermostat oscillation:** noisy signals cause promote/demote thrash. Mitigation: promotion needs a sustained window; demotion has hysteresis before re-promotion is allowed.
- **Legal exposure at L3 claims:** an autonomous claims approval causes a UWG problem. Mitigation: claims default ceiling is L3 with mandatory sampling + instant demotion to L0 on any claims defect; policy may pin claims at L0 per locale.

## Acceptance criteria

- [x] `Approver`, `AutonomyLevel`, `AutonomyScope`, `AutonomyState`, and `ApprovalRecord` types exist in the shared surface/kernel layer. (evidence: implemented historically)
- [x] RFC-0197/RFC-0272 approval provenance carries a typed approver and `atLevel`. (evidence: implemented historically)
- [x] `autonomy.level.validate`, `autonomy.level.report`, `autonomy.promote`, and `autonomy.demote` are registered. (evidence: implemented historically)
- [x] `autonomy.promote` refuses promotion without a calibration record meeting the level bar. (evidence: implemented historically)
- [x] Defined demotion triggers automatically lower a scope and append a Bordbuch event. (evidence: implemented historically)
- [x] `claims` and `product` field-classes cannot exceed their configured ceiling. (evidence: implemented historically)
- [x] `warpgogol-com` declares per-scope autonomy ceilings with all scopes starting at L0. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Never write an `agent:` approval above the scope's sanctioned level to clear a queue; that is `AUTO-01` and it is a correctness violation, not a shortcut.
- Never raise a level or ceiling to make a warning disappear. Promotion is earned from recorded evidence; demotion is not optional when a trigger fires.
- Treat "AI-exclusive" as a destination the metrics unlock, not a mode you may assert. The correct way to remove a human is to make the numbers good enough that `autonomy.promote` allows it.
- Keep the circuit-breaker (RFC-0283) and observation loop (RFC-0282) out of scope of any level; no autonomy level may disable them.
