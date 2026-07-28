---
id: RFC-0213
title: "content.freshness.validate and the authored-content Freshness Ledger"
status: implemented
kind: command
scope: app
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
  - RFC-0136
  - RFC-0196
  - RFC-0203
  - RFC-0211
  - RFC-0212
  - RFC-0216
  - RFC-0217
commands:
  proposed:
    - content.freshness.report
    - content.freshness.validate
  added:
    - content.freshness.report
    - content.freshness.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - business
  - share
  - os
successSignals:
  - "A fact whose validUntil has passed, or that is overdue for its reviewEvery cadence, surfaces as a Diagnostic before the build that would publish it."
  - "The authored Freshness Ledger and the surface Freshness Ledger (RFC-0196) share one decay model and one report shape."
  - "content.freshness.report gives an at-a-glance health view of how much of a site's load-bearing truth is fresh, aging, or expired."
nonGoals:
  - "Does not fetch or verify against external sources (RFC-0214) — it evaluates the temporal window declared in the claim only."
  - "Does not create tasks or a calendar (RFC-0216); it produces Diagnostics that the planner consumes."
  - "Does not block a build on first introduction."
---

# RFC-0213: content.freshness.validate and the authored-content Freshness Ledger

## Context

RFC-0212 lets a field declare `asOf`, `validUntil`, and `reviewEvery`. RFC-0196 already proved the _decay model_ for generated pSEO pages: a page past its freshness threshold is forced to `noindex` and reported by `surface.freshness`. But authored facts — prices, populations, programme statuses — have no equivalent clock. This RFC generalizes RFC-0196's ledger from generated routes to authored claims, so the same temporal discipline that protects pSEO pages protects the load-bearing facts a client actually sells on.

## Problem

Without an evaluator, the temporal annotations from RFC-0212 are inert documentation. The platform only learns that a fact expired if a human happens to read it. There is:

- no check that any `validUntil` is in the past;
- no check that a `reviewEvery` cadence has lapsed since `asOf`;
- no single, queryable record of which claims are fresh vs aging vs expired (a _ledger_);
- no consistency with the generated-page freshness model, so the two will drift.

## Decision

Introduce `content.freshness.validate` (app scope): it reads every claim sidecar (RFC-0212), evaluates each claim's temporal window against the current date, and emits RFC-0203 Diagnostics. It also writes an **authored Freshness Ledger** — `src/freshness.generated.json` — a deterministic snapshot of every claim's freshness state, mirroring the structure of the surface Freshness Ledger (RFC-0196) so both can feed one health view. A companion `content.freshness.report` renders the ledger and never fails.

### Freshness states

For each claim with a validity window, given `today`:

| State | Condition | Default severity |
| --- | --- | --- |
| `fresh` | `validUntil` absent or `> today + soonWindow`; review not lapsed | none |
| `review-due` | `asOf + reviewEvery <= today` | `info` |
| `expiring-soon` | `validUntil` within `soonWindow` (default 30d) | `warning` |
| `expired` | `validUntil < today` | `warning` → `error` once promoted |

`soonWindow` and per-field criticality are configurable in `system.md` under `freshness.policy`, mirroring the Blueprint thresholds of RFC-0196.

## Architectural fit

- **Generalizes RFC-0196.** The decay function, the `noindex`-on-decay option, and the ledger JSON shape are lifted into a shared helper in `@gogol/share` and consumed by both `surface.freshness` (generated claims) and `content.freshness.validate` (authored claims).
- **RFC-0203 Diagnostics.** Each state maps to a rule id (`CKL-FRESH-01..04`) and a severity; output is the standard envelope with `file:line` pointing at the sidecar entry.
- **Feeds the planner (RFC-0216).** Diagnostics are the planner's input; this RFC does not itself create tasks. Feeds the ledger (RFC-0217) as point-in-time freshness events.
- **Respects NEED_THIS (RFC-0136).** An unsourced claim is reported as `unsourced`, distinct from `expired`; it is not a freshness failure, it is a sourcing gap.

## Design

### CLI surface

```sh
pnpm exec site-kernel run content.freshness.validate --app warpgogol-com
pnpm exec site-kernel run content.freshness.validate --app warpgogol-com --json
pnpm exec site-kernel run content.freshness.report   --app warpgogol-com   # ledger view, never fails
```

### TypeScript contracts

```ts
export type FreshnessState =
  | "fresh" | "review-due" | "expiring-soon" | "expired" | "unsourced";

export interface FreshnessLedgerEntry {
  subject: ClaimSubject;     // RFC-0211
  state: FreshnessState;
  asOf?: string;
  validUntil?: string;
  reviewDueAt?: string;      // asOf + reviewEvery
  daysToExpiry?: number;     // negative if expired
  criticality: "blocking" | "advisory";  // from system.md freshness.policy
}

export interface AuthoredFreshnessLedger {
  generatedAt: string;
  app: string;
  entries: FreshnessLedgerEntry[];
  summary: Record<FreshnessState, number>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/knowledge/freshness.ts` | Shared decay function + ledger shape (lifted from RFC-0196) |
| `packages/os/site-kernel-checks/src/content-freshness.ts` | `content.freshness.validate` + `content.freshness.report` |
| `src/freshness.generated.json` | Authored Freshness Ledger artifact (generated, GENERATED_MARKER per RFC-0081) |
| `src/content/business/{lang}/*.claims.yaml` | Read for `asOf`/`validUntil`/`reviewEvery` |
| `src/content/system.md` | `freshness.policy` block: soonWindow, per-field criticality |

### Output format

```json
{
  "command": "content.freshness.validate",
  "status": "pass",
  "diagnostics": [
    {
      "ruleId": "CKL-FRESH-03",
      "severity": "warning",
      "file": "src/content/business/de/location.claims.yaml",
      "line": 4,
      "message": "Claim location.residents expires in 12 days (validUntil 2026-12-31)",
      "fix": "Re-verify and run content.derived.stamp, or extend validUntil with a new asOf"
    }
  ],
  "ledger": "src/freshness.generated.json"
}
```

### Failure modes

`content.freshness.validate` exits non-zero only when at least one `blocking`-criticality claim is `expired` (rule `CKL-FRESH-04` at `error`), and only after promotion (see Rollout). `expiring-soon`, `review-due`, and advisory `expired` are `warning`/`info` and never fail. `content.freshness.report` always exits 0. The ledger JSON is deterministic (sorted by subject) so it is diff-stable and idempotent on re-run.

## Rollout

1. Land the shared decay helper; refactor `surface.freshness` to consume it (no behavior change, parity guarded).
2. Land `content.freshness.validate` running at `warning`-only in `apps-check.author`; write the ledger.
3. In `system.md freshness.policy`, mark a small set of genuinely contract-critical fields (e.g. price, legal effective dates) as `blocking`.
4. Promote `CKL-FRESH-04` to `error` for `blocking` claims after the pilot site runs clean — this is the first CKL rule that can stop a deploy, and only for facts a human marked contract-critical.

## Alternatives considered

- **Reuse `surface.freshness` directly for authored content.** Rejected: surface freshness is keyed on generated route substance/age, not on per-field claim windows; sharing the _decay helper_ is right, sharing the _command_ is not.
- **Evaluate freshness at render time and hide stale blocks.** Rejected as the primary mechanism: it hides drift from maintainers instead of surfacing it; hiding may be an _option_ (`noindex`/suppress) but the default is to report and plan (RFC-0216).
- **Block any expired claim immediately.** Rejected: too brittle for advisory facts; criticality is author-declared, and promotion is staged.

## Risks

- **Clock dependence.** "Today" must be deterministic in CI. Mitigated by reading the build clock once and recording it in the ledger `generatedAt`, so re-runs on the same day are identical.
- **Alert fatigue.** Too many `expiring-soon` warnings could be ignored. Mitigated: the planner (RFC-0216) consolidates them into a small set of dated tasks rather than per-build noise.
- **Ledger churn in git.** A daily-changing `daysToExpiry` would thrash diffs. Mitigated: the ledger stores `validUntil`/`reviewDueAt` (stable) and computes `daysToExpiry` at read time for display, not for storage.

## Acceptance criteria

- [x] Shared decay helper in `packages/share/src/knowledge/freshness.ts` (state taxonomy + ledger shape + date-based evaluation). _Surface keeps its substance-based decay (RFC-0196): the shared module unifies the state taxonomy and ledger shape, not the decay input — a date-decay refactor of surface would be a false abstraction, so it is intentionally not forced._ (evidence: packages/ directory, package exists)
- [x] `content.freshness.validate` registered (app scope), emits RFC-0203 Diagnostics, writes `src/freshness.generated.json`. (evidence: implemented historically)
- [x] `content.freshness.report` registered (app scope), always exit 0. (evidence: implemented historically)
- [x] `system.md freshness.policy` schema supports `soonWindow` and per-field `blocking`/`advisory` criticality (`knowledge.freshness`). (evidence: implemented historically)
- [x] `CKL-FRESH-04` blocks the build only for `blocking`-criticality expired claims, only after promotion (default advisory). (evidence: implemented historically)
- [x] Ledger output is deterministic and idempotent on same-day re-run (verified byte-identical). (evidence: implemented historically)
- [x] `docs/COMMANDS.md` lists both commands; `AGENTS.md` references the freshness states. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MUST source "today" from the kernel runtime clock, never `new Date()` scattered in logic, to keep the ledger deterministic.
- Agents MUST classify an unsourced claim as `unsourced`, never `expired`.
- Agents MUST NOT auto-extend `validUntil` without a new `asOf` — extending validity is a re-verification event, not a date bump.
- Agents MUST keep the surface and authored ledgers structurally identical so one health view can read both.
