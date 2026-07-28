---
id: RFC-0284
title: "Introduce the fleet Leitstand as an autonomous cross-site control plane"
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
  - RFC-0179
  - RFC-0221
  - RFC-0270
  - RFC-0275
  - RFC-0276
  - RFC-0277
  - RFC-0278
  - RFC-0282
  - RFC-0283
  - RFC-0285
commands:
  proposed: []
  added:
    - fleet.status.collect
    - fleet.schedule.plan
    - fleet.killswitch
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "One control plane reads the per-site Bordbuch and status projections of many sites and presents fleet health as data."
  - "Generation, enrichment, translation, and review work across the fleet is scheduled from dirty flags and budgets, not run by hand per site."
  - "Escalations from every site converge into one governed human queue whose size is a tracked, shrinking KPI."
  - "A single fleet kill-switch can freeze autonomous action across all sites, and per-site circuit-breakers still act locally."
nonGoals:
  - "Do not centralize per-site state; the Leitstand consumes per-site primitives (Bordbuch, autonomy, breaker), it does not replace them."
  - "Do not implement the multi-tenant hosting/runtime here; that is RFC-0179's concern."
  - "Do not let the Leitstand approve content; approval authority lives per scope under RFC-0278."
---

# RFC-0284: Introduce the fleet Leitstand as an autonomous cross-site control plane

## Context

The stated destination is thousands of sites operated predominantly by AI over a decade. RFC-0275, RFC-0276, and RFC-0277 all gesture at a future "Leitstand" that will consume per-site primitives, but none defines it. RFC-0276 is explicit that Bordbuch is "the per-site primitive" a future Leitstand reads.

The per-site RFCs make each site _individually_ governable and increasingly autonomous. The Leitstand is what makes the _fleet_ governable: the place where one operator (human or agent) sees all sites at once, where work is scheduled and budgeted across sites, where escalations converge, and where a single control can stop everything. Without it, "AI manages thousands of sites" has no home; there is only N unrelated sites and no plane on which the fleet is a single object.

## Problem

- There is no aggregator of per-site status: no way to answer "which sites are blocked, awaiting translation review, drifting, or tripped" across the fleet.
- Work (generation, enrichment, translation, review) has no cross-site scheduler; each site is run manually, which does not scale past a handful.
- Escalations (RFC-0285) have no single destination; a shrinking human budget cannot be measured if it is scattered across N terminals.
- There is no global kill-switch; a systemic problem (bad model, bad prompt, provider incident) cannot be stopped fleet-wide in one action.
- Global budgets (LLM spend, review hours, CI time) are unenforceable because nothing sees the whole.

## Decision

The platform gains a **fleet Leitstand**: a control plane that consumes per-site primitives and coordinates the fleet without owning site state.

1. `fleet.status.collect` reads each site's RFC-0276 Bordbuch status, RFC-0278 autonomy state, RFC-0282 outcomes, and RFC-0283 breaker state into one fleet view.
2. `fleet.schedule.plan` computes a cross-site work plan from dirty flags (records, claims, freshness, enrichment, translation, breaker) under global budgets and concurrency limits, emitting an ordered queue of per-site jobs.
3. `fleet.killswitch` freezes autonomous action across all sites (or a cohort) in one command; per-site breakers (RFC-0283) continue to act locally regardless.

The Leitstand **schedules and observes**; it never approves content (RFC-0278 keeps approval per scope) and never holds site state (Bordbuch/autonomy/breaker remain authoritative per site). It is itself governed: its own actions carry an autonomy level, so fleet-scale automation climbs the same evidence ladder as per-site automation.

## Architectural fit

- RFC-0276 Bordbuch is the per-site status source; the Leitstand is the many-Bordbuch reader it was designed for.
- RFC-0278 autonomy states roll up into a fleet autonomy map; RFC-0285 escalations converge into the fleet queue.
- RFC-0282 action plans and RFC-0283 breaker states aggregate so the fleet sees expansion pressure and harm signals together.
- RFC-0275 dirty flags are the scheduler's input; RFC-0270 timing budgets bound per-job cost; RFC-0179's multi-tenant runtime is the eventual execution substrate (out of scope here).
- RFC-0221 handoff/absorb remains how sites enter/leave the fleet; the Leitstand tracks membership, not packaging.

## Design

### TypeScript contracts

```ts
export interface FleetSiteStatus {
  site: string;
  bordbuchHash: string;             // RFC-0276 latest ledger hash
  autonomy: Record<string, string>; // scope → level (RFC-0278)
  openEscalations: number;          // RFC-0285
  breaker: "armed" | "tripped" | "frozen";  // RFC-0283
  dirtyFlags: string[];             // RFC-0275
  lastOutcomeWindow?: string;       // RFC-0282
}

export interface FleetJob {
  site: string;
  kind: "generate" | "enrich" | "translate" | "review" | "rollback";
  scope?: string;
  priority: number;
  estimatedCost: { llmTokens?: number; reviewMinutes?: number; ciSeconds?: number };
}

export interface FleetPlan {
  collectedAt: string;
  budgets: { llmTokens: number; reviewMinutes: number; ciSeconds: number };
  jobs: FleetJob[];                 // ordered, budget-clipped
  blocked: Array<{ site: string; reason: string }>;
}
```

### CLI surface

```sh
pnpm exec site-kernel run fleet.status.collect --sites ./fleet.sites.json --json
pnpm exec site-kernel run fleet.schedule.plan --sites ./fleet.sites.json --budget ./fleet.budget.json --json
pnpm exec site-kernel run fleet.killswitch --scope all --reason "provider incident" --json
```

### File system responsibilities

| Path                                | Role                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| `fleet/fleet.sites.json`            | Fleet membership + per-site pointers (repo or path/URL) |
| `fleet/fleet.status.generated.json` | Collected fleet status snapshot                         |
| `fleet/fleet.plan.generated.json`   | Scheduled cross-site work plan                          |
| `fleet/killswitch.state.json`       | Current global freeze state                             |

### Scheduling policy

- **Budget-clipped:** jobs are ordered by priority (breaker/rollback > escalation-clearing > demand-driven expansion > enrichment) and clipped to global budgets; overflow becomes `blocked` with a reason, never silently dropped.
- **Fairness:** no single site may consume more than a configured share of a window's budget, so one large site cannot starve the fleet.
- **Autonomy-aware:** higher-autonomy scopes (RFC-0278) need less scheduled human-review time; the plan surfaces the fleet's aggregate human-minutes demand as the KPI RFC-0285 tracks toward zero.

## Failure modes

- A site's Bordbuch is unreachable/stale: it appears `blocked` in the plan with a reason; the fleet view marks it degraded rather than guessing its state.
- Budget exhausted: lower-priority jobs are deferred to `blocked`; safety jobs (rollback, breaker) are never budget-clipped.
- Kill-switch engaged: all scheduled autonomous jobs halt; per-site breakers still act; clearing the switch is an explicit, logged action.
- Conflicting site autonomy vs fleet policy: the stricter of the two wins (a site frozen locally stays frozen even if the fleet plan would schedule it).

## Rollout

1. Define the fleet membership file and `fleet.status.collect` over the single dogfood site plus a second test site.
2. Add `fleet.schedule.plan` in report-only mode; verify job ordering and budget clipping.
3. Route RFC-0285 escalations into a single fleet queue; start reporting fleet human-minutes/1000-pages.
4. Add `fleet.killswitch`; rehearse a fleet-wide freeze and recovery.
5. Grow membership as sites onboard (RFC-0221); let the plan drive gated auto-execution as autonomy and safety mature.

## Alternatives considered

- **Build the Leitstand as the primary state store.** Rejected: it would duplicate per-site Bordbuch/autonomy/breaker and create drift; the plane consumes primitives, it does not own them.
- **No control plane; run sites individually.** Rejected: manual per-site operation is the fleet-scale throughput trap and has no place for a global kill-switch or budget.
- **Let the Leitstand approve content centrally.** Rejected: approval authority is per scope (RFC-0278); centralizing it would erase field-class and locale nuance and concentrate risk.
- **Wait for RFC-0179 hosting first.** Rejected: control-plane observability and scheduling are useful before multi-tenant runtime and inform its requirements.

## Risks

- **Central point of control becomes a central point of failure.** Mitigation: the Leitstand is stateless over per-site primitives and idempotent; if it is down, sites keep their local autonomy and breakers.
- **Scheduler starvation or thrash.** Mitigation: fairness shares and priority tiers; safety jobs bypass budget clipping.
- **Fleet view drift from reality.** Mitigation: status is a collected snapshot with per-site hashes; stale sites are flagged, not assumed healthy.
- **Over-automation of fleet actions.** Mitigation: the Leitstand's own actions are autonomy-governed and start report-only; the kill-switch is always available.

## Acceptance criteria

- [x] `FleetSiteStatus`, `FleetJob`, and `FleetPlan` types exist. (evidence: implemented historically)
- [x] `fleet.status.collect`, `fleet.schedule.plan`, and `fleet.killswitch` are registered. (evidence: implemented historically)
- [x] Status is collected from per-site Bordbuch/autonomy/breaker without duplicating their state. (evidence: implemented historically)
- [x] The scheduler is budget-clipped, fair, and never clips safety jobs. (evidence: implemented historically)
- [x] Escalations converge into one fleet queue and fleet human-minutes/1000-pages is reported. (evidence: implemented historically)
- [x] The kill-switch freezes autonomous action fleet-wide while per-site breakers still act locally. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- The Leitstand schedules and observes; it never approves content and never becomes the site's state store.
- The stricter of site-local and fleet policy always wins; a locally frozen or demoted scope stays that way.
- Safety work (rollback, breaker response, escalation clearing) is never deferred for budget reasons.
- Treat fleet human-minutes-per-1000-pages as the headline trajectory metric: it must trend toward zero for the AI-exclusive goal to be real (RFC-0285).
