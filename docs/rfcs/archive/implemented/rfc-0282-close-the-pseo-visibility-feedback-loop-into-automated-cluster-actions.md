---
id: RFC-0282
title: "Close the PSEO visibility feedback loop into automated cluster actions"
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
  - RFC-0213
  - RFC-0216
  - RFC-0274
  - RFC-0276
  - RFC-0277
  - RFC-0278
  - RFC-0280
  - RFC-0283
  - RFC-0284
commands:
  proposed: []
  added:
    - visibility.import
    - visibility.reconcile
    - visibility.action.plan
  changed:
    - pseo.proof.validate
    - site.bordbuch.status
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/surface"
  - "@gogol/share"
successSignals:
  - "Each PSEO cluster has imported observability (indexation, impressions, queries, position) reconciled against its generated pages."
  - "The system proposes a per-cluster action — expand, hold, prune, enrich, or escalate — from measured outcomes, not from route-count enthusiasm."
  - "Enrichment and expansion fire only after a cluster shows demand signal, never speculatively."
  - "Realized impressions feed back to correct the RFC-0280 demand map and RFC-0278 autonomy calibration."
nonGoals:
  - "Do not build a real-time analytics dashboard; this is a periodic control loop over versioned snapshots."
  - "Do not call external APIs during deterministic build; import is an offline pass."
  - "Do not auto-execute destructive actions; the loop proposes, and execution obeys RFC-0277 URL policy, RFC-0278 autonomy, and RFC-0283 safety."
---

# RFC-0282: Close the PSEO visibility feedback loop into automated cluster actions

## Context

Fable §E.10 names it exactly: observability is "the missing organ". The platform generates a surface but has no closed loop from _what actually happened in search_ back to _what the system should do next_. RFC-0277 lists proof gates and RFC-0276 Bordbuch can display metrics, but nothing turns Google Search Console (GSC) outcomes into decisions. Fable §E.6 adds the corollary: enrichment should fire only _after_ a cluster shows a GSC signal, not before — today nothing enforces that ordering.

A system that generates but never senses cannot be operated by AI, because there is no feedback for the AI to act on. This RFC builds the sense→decide loop; RFC-0283 builds the safety reflex; RFC-0284 runs both across the fleet.

## Problem

- No contract imports GSC/visibility data as versioned snapshots bound to clusters.
- No reconciliation matches imported outcomes to generated pages (which page got which impressions).
- No policy converts outcomes into actions (expand winners, prune non-performers, hold, enrich, escalate).
- Enrichment is not gated on demonstrated demand, so spend can precede any signal (Fable §E.6).
- Realized outcomes never correct the demand map (RFC-0280) or the autonomy calibration (RFC-0278), so the system cannot learn.

## Decision

The platform gains a **visibility feedback loop** in three offline commands:

1. `visibility.import` — ingest GSC/visibility exports into versioned per-cluster snapshots (indexation state, impressions, clicks, unique queries, average position, observation window).
2. `visibility.reconcile` — join snapshots to generated pages and clusters, producing a per-cluster outcome record and flagging anomalies (indexed-but-zero-impressions, impressions-but-zero-clicks, duplicate cannibalization).
3. `visibility.action.plan` — apply a declarative policy to outcome records and emit a **proposed action per cluster**: `expand`, `hold`, `prune`, `enrich`, or `escalate`.

Actions are **proposals**, executed only through the governed paths: expansion/enrichment obey RFC-0278 autonomy and RFC-0280 demand; pruning obeys RFC-0277 URL non-destruction policy (retire by quality, with redirect map — never by tariff); escalation goes to the RFC-0285 human queue. Enrichment is explicitly forbidden for a cluster with no positive demand signal.

## Architectural fit

- RFC-0213/0216 freshness and maintenance planning gain their missing input: real outcomes, not just age.
- RFC-0274 duplicate detection is reinforced by realized _query cannibalization_ data, not only build-time similarity.
- RFC-0276 Bordbuch status renders the loop's current cluster states and pending actions.
- RFC-0277 proof gates read reconciled outcomes for the indexation, query-diversity, and core-safety gates.
- RFC-0278 calibration consumes realized outcomes as ground truth for promotion/demotion; RFC-0280 demand map is corrected by realized impressions.
- RFC-0283 consumes the same snapshots to trip its safety breaker; RFC-0284 aggregates action plans across the fleet.

## Design

### TypeScript contracts

```ts
export interface VisibilitySnapshot {
  clusterId: string;                // blueprint + industry + geo scope + demand
  windowStart: string; windowEnd: string;
  indexedPages: number; eligiblePages: number;
  impressions: number; clicks: number;
  uniqueQueries: number; avgPosition?: number;
  source: "gsc" | "manual"; importedAt: string;
}

export type ClusterAction = "expand" | "hold" | "prune" | "enrich" | "escalate";

export interface ClusterOutcome {
  clusterId: string;
  indexationRate: number;           // indexed / eligible
  medianImpressionsPerPage: number;
  queryDiversityShare: number;      // pages with >1 query / pages
  anomalies: string[];              // cannibalization, indexed-zero-impressions, ...
  proposedAction: ClusterAction;
  rationale: string;
}
```

### Action policy (declarative, per module/experiment)

```yaml
visibilityPolicy:
  observationWindowDays: 28
  actions:
    expand:  { indexationRateMin: 0.6, medianImpressionsMin: 30 }   # winners earn more coverage
    prune:   { afterWindows: 3, impressionsMax: 0 }                  # retire by quality (RFC-0277)
    enrich:  { requirePositiveDemand: true }                         # never enrich a silent cluster
    escalate: { onAnomaly: [core-degradation, cannibalization] }
```

### CLI surface

```sh
pnpm exec werkstatt run visibility.import --app warpgogol-com --source gsc --input ./exports/gsc.json --json
pnpm exec werkstatt run visibility.reconcile --app warpgogol-com --json
pnpm exec werkstatt run visibility.action.plan --app warpgogol-com --module pseo --json
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/surface/visibility/<window>.snapshot.json` | Versioned imported outcome snapshot |
| `apps/<app>/src/surface/visibility/outcomes.generated.json` | Reconciled per-cluster outcomes + proposed actions |

### Validation / diagnostics

| Rule | Severity | Meaning |
| --- | --- | --- |
| `VIS-01` | error | Snapshot references a cluster with no generated pages (reconciliation break) |
| `VIS-02` | warning | Cluster indexed but zero impressions past the observation window (demand mismatch) |
| `VIS-03` | error | `enrich` action proposed for a cluster with no positive demand signal |
| `VIS-04` | warning | Query cannibalization detected across sibling pages |
| `VIS-05` | error | Snapshot contains PII or per-user rows |

## Failure modes

- Missing observability for a cluster: outcomes report "not enough data"; proof gates (RFC-0277) do not pass on absence; no action proposed except `hold`.
- `enrich` proposed without demand: `VIS-03` error; the plan drops the action.
- Prune proposed: it is a proposal only; execution requires RFC-0277 policy (quality reason + redirect map), never automatic deletion.
- Import malformed/contains PII: import fails (`VIS-05`); prior snapshots retained.

## Rollout

1. Add snapshot/outcome schemas and `visibility.import`/`visibility.reconcile` (report-only).
2. Render reconciled outcomes in Bordbuch status (RFC-0276).
3. Wire outcomes into `pseo.proof.validate` gates (RFC-0277).
4. Add `visibility.action.plan` proposing actions; keep execution manual/gated first.
5. Let RFC-0284 Leitstand consume action plans across the fleet; let RFC-0278 calibration consume realized outcomes.
6. Enable gated auto-execution of non-destructive actions (`expand`, `enrich`, `hold`) as autonomy rises; keep `prune`/`escalate` on the governed paths.

## Alternatives considered

- **Real-time dashboard.** Rejected: the decision cadence is weekly, not per-second; versioned snapshots are auditable and diffable, a live dashboard is not.
- **Enrich everything up front, measure later.** Rejected: Fable §E.6; it spends the expensive resource (review/enrichment) before any signal justifies it.
- **Let humans read GSC and decide.** Rejected: that is the per-cluster throughput trap; the loop must be machine-readable so the fleet can act.
- **Auto-delete non-performers.** Rejected: violates RFC-0277 URL non-destruction; retirement is quality-gated with redirects, not silent deletion.

## Risks

- **Acting on noise.** Mitigation: multi-window confirmation before `expand`/`prune`; anomalies escalate rather than auto-act.
- **Reconciliation drift** when URLs change. Mitigation: cluster ids are stable identity keys; migrations carry redirect maps (RFC-0277/D8).
- **Learning the wrong lesson** (optimizing to impressions, not leads). Mitigation: outcomes track query diversity and downstream conversion where instrumented; RFC-0277 proof gates weigh conversion, not just impressions.

## Acceptance criteria

- [x] `VisibilitySnapshot`, `ClusterOutcome`, and `ClusterAction` types exist. (evidence: implemented historically)
- [x] `visibility.import`, `visibility.reconcile`, and `visibility.action.plan` are registered and run offline. (evidence: implemented historically)
- [x] Reconciliation joins snapshots to generated clusters and flags anomalies. (evidence: implemented historically)
- [x] The action policy proposes expand/hold/prune/enrich/escalate per cluster. (evidence: implemented historically)
- [x] `enrich` cannot be proposed for a cluster without positive demand (`VIS-03`). (evidence: implemented historically)
- [x] Outcomes feed `pseo.proof.validate`, Bordbuch status, RFC-0278 calibration, and the RFC-0280 demand map. (evidence: implemented historically)
- [x] Snapshots are PII-guarded. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- The loop proposes; governed paths dispose. Never let `visibility.action.plan` delete or noindex a URL directly.
- Never enrich a cluster that has shown no demand; wait for the signal (Fable §E.6).
- Treat realized outcomes as the ultimate truth that grades the AI reviewer (RFC-0279) and the demand map (RFC-0280); wire the feedback, do not strand it in a report.
- Keep import offline and PII-free; store aggregate cluster metrics only.
