---
id: RFC-0283
title: "Add an automated safety circuit-breaker and surface rollback"
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
amendedBy:
  - RFC-0318
related:
  - RFC-0221
  - RFC-0258
  - RFC-0269
  - RFC-0274
  - RFC-0276
  - RFC-0277
  - RFC-0278
  - RFC-0282
  - RFC-0284
commands:
  proposed: []
  added:
    - surface.breaker.evaluate
    - surface.rollback.plan
    - surface.rollback.apply
  changed:
    - surface.generate
    - site.bordbuch.append
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/surface"
  - "@gogol/share"
successSignals:
  - "Every autonomous surface expansion is reversible: a prior good surface state can be restored deterministically."
  - "Defined tripwires — core-page degradation, mass non-indexation, duplicate-footprint spikes — automatically freeze expansion and can roll the surface back."
  - "A circuit-breaker trip demotes the responsible autonomy scope and opens a human escalation, without waiting for a person to notice."
  - "Rollback obeys URL non-destruction policy: it restores prior good pages, it does not silently delete accumulated public assets."
nonGoals:
  - "Do not make the breaker a substitute for earned calibration; it is a damage floor, not a quality gate."
  - "Do not delete published URLs as a rollback mechanism; rollback restores a prior good state under RFC-0277 policy."
  - "Do not run the breaker inside deterministic build; it evaluates versioned observability and surface snapshots offline."
---

# RFC-0283: Add an automated safety circuit-breaker and surface rollback

## Context

Fable's failure catalogue §D7 is the catastrophic one: a large share of thin template pages shifts the host's quality profile and _core_ pages — services, about, the GBP landing page — lose rankings. Fable's mitigation is explicit and load-bearing: "the full-surface rollback mechanism must exist in advance." Today it does not. Neither does any automatic detector for the tripwires in §D1–D8.

For a system moving toward AI-exclusive operation this is non-negotiable. Autonomy without a reflex is recklessness. RFC-0278 lets scopes climb to L4; RFC-0282 lets the system expand automatically. The precondition for both is a **circuit-breaker**: an automatic reflex that detects harm and reverses the machine's own actions faster than a human could — and a **rollback** that is safe under the URL non-destruction promise.

## Problem

- There is no reversible surface state: `surface.generate` overwrites; there is no "last known good" to restore.
- There is no automated tripwire for core-page degradation, mass non-indexation, or duplicate-footprint spikes.
- There is no link from "harm detected" to "expansion frozen + autonomy demoted + human paged."
- Consequently the only stop is a human noticing a ranking drop days later — unacceptable at one site, impossible across a fleet.

## Decision

The platform gains an **automated safety circuit-breaker** and a **deterministic surface rollback**.

1. **Reversible surface states.** Each `surface.generate` run records an immutable, content-addressed surface state (registry + shard fingerprints, RFC-0275) tagged as a candidate; a state is promoted to `lastKnownGood` only after it ships and RFC-0282 confirms no regression within an observation window.
2. **Tripwire evaluation.** `surface.breaker.evaluate` reads RFC-0282 snapshots and RFC-0274 duplicate reports and tests declared tripwires (core-click degradation, indexation collapse, duplicate-footprint spike, cannibalization surge).
3. **Trip reflex.** On a trip the breaker: freezes further expansion/enrichment for the affected scope; demotes the responsible RFC-0278 autonomy scope; opens an RFC-0285 escalation; and appends an RFC-0276 Bordbuch event. Optionally it proposes or (at low blast radius) applies a rollback to `lastKnownGood`.
4. **Safe rollback.** `surface.rollback.apply` restores a prior good surface state. It never deletes published URLs to achieve the rollback: pages that must leave the index are noindexed or redirected under RFC-0277 policy with a migration map, and the event is logged.

## Architectural fit

- RFC-0275 shard fingerprints make surface states content-addressed and therefore cheaply restorable; rollback is a pointer move plus a governed diff, not a rebuild-from-scratch.
- RFC-0221 handoff/absorb already models packaged, restorable site state; rollback reuses that discipline for the surface subset.
- RFC-0277 URL non-destruction policy constrains rollback: restore prior good, do not erase accumulated assets.
- RFC-0278 consumes trips as demotion triggers; RFC-0282 supplies the outcome signals the breaker tests; RFC-0284 aggregates breaker state across the fleet and enforces a global kill-switch.
- RFC-0258 atomic-write governance applies to any shared state the breaker rewrites.

## Design

### TypeScript contracts

```ts
export interface SurfaceState {
  id: string;                       // content hash of registry + shard fingerprints
  app: string; createdAt: string;
  status: "candidate" | "shipped" | "lastKnownGood" | "rolledBack";
  pageCount: number; indexableCount: number;
}

export interface Tripwire {
  id: string;                       // e.g. "core-click-degradation"
  scope: string;                    // autonomy scope or cluster
  metric: string;                   // from RFC-0282 outcomes
  threshold: number; windowDays: number;
  onTrip: Array<"freeze" | "demote" | "escalate" | "rollback">;
}

export interface BreakerVerdict {
  trippedTripwires: Tripwire[];
  affectedScopes: string[];
  recommendedState?: string;        // lastKnownGood id to restore
  blastRadius: number;              // pages affected
}
```

### Default tripwires (calibrated per site)

| Tripwire | Signal (RFC-0282) | Default | Action |
| --- | --- | --- | --- |
| `core-click-degradation` | core-page clicks vs pre-release baseline | −20% sustained 4 weeks (Fable D7) | freeze + escalate + rollback |
| `indexation-collapse` | eligible-page indexation rate | < 30% at week 8 (Fable D1) | freeze + demote |
| `duplicate-footprint-spike` | near-duplicate cluster share (RFC-0274) | policy | freeze + demote + escalate |
| `cannibalization-surge` | sibling query overlap (RFC-0282 VIS-04) | policy | escalate |

### CLI surface

```sh
pnpm exec werkstatt run surface.breaker.evaluate --app warpgogol-com --json
pnpm exec werkstatt run surface.rollback.plan --app warpgogol-com --to <lastKnownGood-id> --json
pnpm exec werkstatt run surface.rollback.apply --app warpgogol-com --to <lastKnownGood-id> --json
```

### File system responsibilities

| Path                                            | Role                                         |
| ----------------------------------------------- | -------------------------------------------- |
| `apps/<app>/src/surface/states/<id>.state.json` | Immutable surface-state descriptor           |
| `apps/<app>/src/surface/states/pointer.json`    | Current `lastKnownGood` / `shipped` pointers |
| `apps/<app>/src/surface/breaker.log.ndjson`     | Append-only trip log                         |

### Validation / diagnostics

| Rule     | Severity | Meaning                                                                |
| -------- | -------- | ---------------------------------------------------------------------- |
| `BRK-01` | error    | An expansion shipped without a recorded reversible surface state       |
| `BRK-02` | error    | A tripped tripwire did not freeze the affected scope                   |
| `BRK-03` | error    | Rollback plan would delete a published URL instead of noindex/redirect |
| `BRK-04` | warning  | No `lastKnownGood` exists yet for a scope allowed to auto-expand       |
| `BRK-05` | error    | Autonomy scope ≥ L2 with the breaker disabled                          |

## Failure modes

- Core clicks drop past threshold: breaker freezes the scope, demotes its autonomy, opens escalation, proposes/executes rollback to `lastKnownGood`; Bordbuch records the mission.
- No `lastKnownGood` yet (first release): expansion allowed but flagged `BRK-04`; rollback target is the pre-surface state.
- Rollback would delete URLs: `BRK-03` blocks it; the plan is rewritten to noindex/redirect under RFC-0277.
- Breaker disabled on an autonomous scope: `BRK-05` error — no scope may run ≥ L2 without its safety reflex.

## Rollout

1. Record reversible surface states in `surface.generate`; establish `lastKnownGood` pointers.
2. Add `surface.breaker.evaluate` reading RFC-0282 outcomes; run report-only.
3. Wire trips to freeze + demote (RFC-0278) + escalate (RFC-0285) + Bordbuch (RFC-0276).
4. Add `surface.rollback.plan`/`apply` under RFC-0277 URL policy; rehearse a rollback on the dogfood site.
5. Make `BRK-05` an error so no scope reaches L2 without an armed breaker; let RFC-0284 host the fleet kill-switch.

## Alternatives considered

- **Rely on humans watching GSC.** Rejected: too slow for one site, impossible for a fleet; the harm compounds before anyone looks.
- **Rollback by deleting the surface.** Rejected: violates RFC-0277 URL non-destruction and discards accumulated link equity; rollback restores a good state, it does not scorch earth.
- **Treat the breaker as the quality gate.** Rejected: it is a damage floor that fires on realized harm; quality is earned upstream via calibration (RFC-0278/0279). Both are needed.
- **Manual rollback runbook only.** Rejected: an unautomated reflex is not a reflex; autonomy requires the reversal to be as automatic as the expansion.

## Risks

- **False trips freezing healthy scopes.** Mitigation: multi-window confirmation and blast-radius bounds; a freeze is cheap and reversible, a missed harm is not.
- **Rollback complexity across shards.** Mitigation: content-addressed states (RFC-0275) make restore a pointer move; `surface.rollback.plan` diffs before applying.
- **Breaker itself becomes a single point of failure.** Mitigation: it is evaluated offline over versioned snapshots, is idempotent, and its own failures escalate rather than silently pass.

## Acceptance criteria

- [x] `SurfaceState`, `Tripwire`, and `BreakerVerdict` types exist. (evidence: implemented historically)
- [x] `surface.generate` records reversible, content-addressed surface states with `lastKnownGood` pointers. (evidence: implemented historically)
- [x] `surface.breaker.evaluate`, `surface.rollback.plan`, and `surface.rollback.apply` are registered. (evidence: implemented historically)
- [x] Defined tripwires evaluate RFC-0282 outcomes and RFC-0274 duplicate reports. (evidence: implemented historically)
- [x] A trip freezes the scope, demotes autonomy (RFC-0278), and opens an escalation (RFC-0285). (evidence: implemented historically)
- [x] Rollback restores prior good state without deleting published URLs (`BRK-03`). (evidence: implemented historically)
- [x] No autonomy scope ≥ L2 may run with the breaker disabled (`BRK-05`). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Never ship an autonomous expansion without a recorded reversible state; `BRK-01` is a hard stop.
- Never implement rollback by deleting URLs; restore a good state and use noindex/redirect under RFC-0277.
- Treat a trip as authoritative: freeze first, investigate second; do not re-expand a demoted scope until it re-earns its level.
- The breaker may never be disabled to unblock work on a scope running at or above L2.
