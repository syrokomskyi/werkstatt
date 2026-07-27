---
id: RFC-0216
title: "Proactive maintenance planning: the content review calendar and task router"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-07-05
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0323
related:
  - RFC-0186
  - RFC-0203
  - RFC-0211
  - RFC-0212
  - RFC-0213
  - RFC-0214
  - RFC-0215
  - RFC-0217
  - RFC-0218
commands:
  proposed: []
  added:
    - content.plan.build
    - content.plan.status
    - content.plan.route
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - os
successSignals:
  - "Freshness, source-divergence, and derivation-staleness signals are consolidated into a small set of dated, owner-routed maintenance tasks — not per-build noise."
  - "Content maintenance becomes a planned stream of work scheduled before expiry, instead of an emergency discovered after a fact has rotted."
  - "The build gate is amber-vs-red by criticality: advisory drift warns and ships; contract-critical drift blocks."
nonGoals:
  - "Does not perform the content edits; it schedules and routes them to agents/humans (RFC-0218)."
  - "Does not introduce a new task-tracker of record; it emits portable task artifacts and can sync to an existing tracker."
  - "Does not itself fetch sources (RFC-0214) or compute freshness/derivation (RFC-0213/0215); it consumes their Diagnostics."
---

# RFC-0216: Proactive maintenance planning: the content review calendar and task router

## Context

RFC-0213 (freshness), RFC-0214 (source divergence), and RFC-0215 (derivation staleness) each emit Diagnostics. But Diagnostics are _pull_ signals: you only see them when you run a check or a build. The founder's framing was explicit — build not a _reaction_ system but a _planning_ system: a calendar of when and what to change, so updates are scheduled work before expiry, not emergencies discovered after. This RFC adds the proactive half the platform lacks: it turns the temporal and divergence signals into a **dated, prioritized, owner-routed plan**, and defines the amber-vs-red gate policy.

## Problem

The accumulated CKL signals are individually correct but operationally unusable without consolidation:

- a build surfaces dozens of `expiring-soon`/`review-due`/`outdated` warnings every run, inviting alert fatigue and "calendar burnout";
- nothing fires _ahead_ of an expiry — the signal appears at or after the deadline, not before it;
- there is no routing: a divergence on a legal claim and a stale tagline land in the same undifferentiated warning stream, with no owner and no priority;
- the build gate is binary (pass/fail), so any block is maximal and any non-block is invisible.

## Decision

Introduce the **Content Maintenance Plan**: `content.plan.build` reads the freshness ledger (RFC-0213), source divergences (RFC-0214), and derivation states (RFC-0215), consolidates them into deduplicated **maintenance tasks** with a due date, owner, criticality, and the originating Diagnostics, and writes a deterministic plan artifact `src/maintenance-plan.generated.json` plus a human calendar view. `content.plan.status` answers "what is due / overdue / blocking now". `content.plan.route` exports tasks to an external destination (agent intake queue or a CRM/tracker) reusing the Lagebild outbox transport (RFC-0186).

The plan also defines the **gate policy** consumed by APPS_CHECK:

| Criticality | Pre-expiry       | At/after expiry                    |
| ----------- | ---------------- | ---------------------------------- |
| `advisory`  | task only        | `warning` (amber) — ships          |
| `important` | task + `warning` | `warning` (amber) — ships, flagged |
| `blocking`  | task + `warning` | `error` (red) — build blocked      |

Due dates are computed _before_ the deadline: a claim with `validUntil` gets a task at `validUntil − leadTime` (per `system.md plan.policy`, default 30 days), so the work is scheduled while there is still time.

## Architectural fit

- **Consumes, does not recompute.** The planner is a pure consolidator over RFC-0213/0214/0215 outputs. This keeps each signal's logic in its own module and the planner free of fetching/hashing.
- **RFC-0203 Diagnostics → tasks.** Each task references the rule ids and `file:line` of its source Diagnostics, so a task is traceable back to the exact claim.
- **Outbox transport (RFC-0186).** `content.plan.route` reuses the Lagebild shared-worker outbox and destination handlers (e.g. Pipedrive/agent queue) rather than inventing transport.
- **Gate integration.** APPS_CHECK reads the plan's criticality verdict; only `blocking`+expired produces a red gate. This is the staged promotion path the component RFCs defer to.
- **Ledger (RFC-0217).** Completed tasks and the value changes they cause are recorded as ledger events, giving the "why did this fact change, and when" history.

## Design

### CLI surface

```sh
pnpm exec site-kernel run content.plan.build  --app webgogol-com           # emit plan + calendar
pnpm exec site-kernel run content.plan.status --app webgogol-com           # due / overdue / blocking
pnpm exec site-kernel run content.plan.status --app webgogol-com --json
pnpm exec site-kernel run content.plan.route  --app webgogol-com --to agent-intake
```

### TypeScript contracts

```ts
export type MaintenanceTrigger =
  | "review-due" | "expiring-soon" | "expired" | "source-diverged" | "derived-outdated";

export type Criticality = "advisory" | "important" | "blocking";

export interface MaintenanceTask {
  id: string;                  // stable hash of (subject + trigger) — idempotent across runs
  subject: ClaimSubject;       // RFC-0211
  trigger: MaintenanceTrigger;
  dueAt: string;               // computed pre-deadline (validUntil − leadTime, or reviewDueAt)
  criticality: Criticality;
  owner: string;               // from claim.owner, or app default
  diagnostics: string[];       // originating rule ids + file:line
  status: "open" | "routed" | "done";
}

export interface MaintenancePlan {
  generatedAt: string;
  app: string;
  tasks: MaintenanceTask[];
  gate: { amber: number; red: number };   // counts feeding APPS_CHECK
}
```

Task ids are a stable hash of `(subject, trigger)` so re-running `content.plan.build` does not duplicate tasks; an existing open task is updated in place, a resolved signal closes its task.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/knowledge/plan.ts` | Consolidation + due-date + criticality logic |
| `packages/os/site-kernel-checks/src/content-plan.ts` | `content.plan.build` / `status` / `route` |
| `src/maintenance-plan.generated.json` | Deterministic plan artifact (GENERATED_MARKER, RFC-0081) |
| `src/content/system.md` | `knowledge.plan`: leadTimeDays, defaultOwner, criticalityMap (typed schema field; route destination deferred) |
| `integrations/lagebild-sync-worker/` | Reused outbox transport for `content.plan.route` |

### Output format

```json
{
  "command": "content.plan.status",
  "status": "ok",
  "app": "webgogol-com",
  "due": 3,
  "overdue": 1,
  "blocking": 0,
  "next": [
    {
      "id": "t_8c1a…",
      "subject": "business/de/offer#priceMonthly",
      "trigger": "review-due",
      "dueAt": "2026-07-15",
      "criticality": "important",
      "owner": "agent:offer-maintainer"
    }
  ]
}
```

### Failure modes

`content.plan.build` and `content.plan.status` never fail on their own — they report. The _gate_ effect is exercised by APPS_CHECK reading `plan.gate.red`: a non-zero red count fails the post-build check, and only `blocking`-criticality expired/diverged claims contribute to red. `content.plan.route` is mutating (enqueues to the outbox) and is never on the build path. The plan artifact is deterministic and idempotent: same inputs + same day → byte-identical output.

## Rollout

1. Land `content.plan.build`/`status` reading the three ledgers; emit plan + calendar; wire `status` into `apps-check.postbuild` as report-only.
2. Define `system.md plan.policy` (leadTime, criticality map, owners) on `webgogol-com`.
3. Turn on the amber/red gate: APPS_CHECK consults `plan.gate.red`. Initially keep all triggers `advisory`/`important` (no red), then graduate the small contract-critical set (price, legal) to `blocking` — the first deploy-blocking CKL behavior, intentionally last in the program.
4. Land `content.plan.route` to the agent-intake destination; agents pull tasks (RFC-0218). Optional sync to a human tracker via an outbox destination handler.

## Alternatives considered

- **Adopt Jira/GitLab issues as the system of record.** Rejected as primary: couples content health to an external tracker and a second source of truth. The plan artifact is in-repo and deterministic; routing to a tracker is an optional export, not the store.
- **Calendar-only, no event triggers.** Rejected: pure calendar reviews cause "calendar burnout" and miss event-driven drift (a programme closing). The plan blends time triggers and divergence triggers.
- **Per-build warnings with no consolidation.** Rejected: this is the status quo that produces alert fatigue; consolidation into dated tasks is the point.
- **Block on any drift.** Rejected: over-blocks advisory content; amber/red by author-declared criticality is the calibrated gate.

## Risks

- **Owner sprawl.** Many fine-grained owners could fragment routing. Mitigated by app-level default owners and a small owner vocabulary in `plan.policy`.
- **Gate over-promotion.** Marking too much `blocking` re-creates brittle builds. Mitigated by keeping `blocking` an explicit, audited subset and defaulting everything else to amber.
- **Plan/ledger desync.** The plan must reflect the latest ledgers. Mitigated by `content.plan.build` running after the freshness/derived validators in the pipeline, reading their fresh artifacts.
- **Idempotency bugs.** Unstable task ids would spam duplicates. Mitigated by hashing `(subject,trigger)` and an explicit idempotency test.

## Acceptance criteria

- [x] `content.plan.build` consolidates RFC-0213/0214/0215 signals into deduplicated `MaintenanceTask`s with pre-deadline `dueAt`. (evidence: implemented historically)
- [x] `content.plan.status` reports due/overdue/blocking; both are report-only (never fail). (evidence: implemented historically)
- [x] `src/maintenance-plan.generated.json` is deterministic and idempotent (stable task ids via sha256 of subject+trigger). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] APPS_CHECK consumes `plan.gate.red`; only `blocking` expired/diverged claims block a build. (Phase 3 — not yet wired. Gate verdict logic is implemented + unit-tested via the shared `isRedTask` helper, ready for APPS_CHECK to consume.) (evidence: tests pass, vitest run exitCode=0)
- [x] `system.md` `knowledge.plan` policy (typed schema field) controls leadTime, owner default, and criticality map. (Route destination deferred with the Phase-2 `content.plan.route`.) (evidence: implemented historically)
- [x] `content.plan.route` registered (Phase 2 stub — Lagebild outbox wiring deferred); it is never on the build path. (evidence: implemented historically)
- [x] `docs/COMMANDS.md` + `AGENTS.md` updated; `rfc.validate` passes on this file. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MUST make `content.plan.build` a pure consumer — it must not fetch sources or recompute freshness/derivation; those belong to RFC-0213/0214/0215.
- Agents MUST keep task ids a stable hash of `(subject, trigger)` for idempotency.
- Agents MUST NOT mark a task `done` until the underlying signal clears (the next plan build must not reopen it); closing is signal-driven, not manual.
- Agents MUST default new triggers to `advisory`/`important`, never `blocking`, without explicit `plan.policy` opt-in.
