---
id: RFC-0285
title: "Govern human involvement as a measured, shrinking escalation budget"
status: implemented
kind: policy
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
  - RFC-0218
  - RFC-0276
  - RFC-0277
  - RFC-0278
  - RFC-0279
  - RFC-0282
  - RFC-0283
  - RFC-0284
commands:
  proposed:
    []
  added:
    - escalation.queue.report
    - escalation.route
    - escalation.budget.validate
  changed:
    - autonomy.level.report
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "Human effort is a finite, measured escalation budget, not a per-artifact default."
  - "Every human intervention has a typed reason and feeds back as calibration data that reduces future interventions of the same kind."
  - "Human-minutes per 1000 published pages is a tracked KPI that must trend toward zero for a scope to reach full autonomy."
  - "The system fails loudly when human involvement is required but the budget is exhausted, rather than silently auto-approving."
nonGoals:
  - "Do not eliminate human involvement abruptly; the budget shrinks as calibration earns it (RFC-0278)."
  - "Do not route raw logs or non-decisions into the human queue; only genuine escalations."
  - "Do not let an exhausted budget cause unsafe auto-approval; exhaustion blocks, it does not bypass."
---

# RFC-0285: Govern human involvement as a measured, shrinking escalation budget

## Context

RFC-0278 turns approval into a climbable ladder and RFC-0279 supplies the AI reviewer that lets scopes climb it. But the human does not disappear at the top of the ladder — the role _changes_: from approving every artifact to handling the exceptions the machine cannot yet handle alone. Fable's audit is built around the (correct, for now) assumption that this human is always present. The platform's destination requires the opposite framing: human attention is the scarcest, most expensive resource in the system, and the entire trajectory toward AI-exclusive operation is measured by how fast the demand for it falls.

This RFC makes that framing explicit. Human involvement is not a permanent default sprinkled across the pipeline; it is a **budget** — finite, measured, typed by reason, and designed to shrink. When the budget for a scope trends to zero without defects re-appearing, that scope has _earned_ full autonomy. The escalation queue is therefore the single instrument that both protects quality today and proves the AI-only goal is real over time.

## Problem

- Human review is currently implied everywhere (RFC-0271..0277) with no measurement of how much is actually spent, on what, or whether it is decreasing.
- There is no typed taxonomy of _why_ a human is needed, so interventions cannot become training signal.
- There is no destination-metric: nothing states that human-minutes-per-1000-pages must fall for autonomy to be real.
- Without a governed queue, an exhausted human could either become a rubber stamp (Fable §B6's "approval degenerates into a formality") or silently let the machine auto-approve — both unsafe.

## Decision

Human involvement is governed as a **measured escalation budget** with three rules.

1. **Escalation, not default.** A human is invoked only through a typed `Escalation`, not as the standing approver. Escalation reasons form a closed taxonomy:

| Reason | Source | Typical disposition |
| --- | --- | --- |
| `low-reviewer-confidence` | RFC-0279 abstain | human verdict → golden set |
| `novel-template` | first N of a new template/field (RFC-0272) | human verdict → calibration |
| `claims-class` | any claims field above its floor (RFC-0278) | human verdict, always |
| `anomaly` | RFC-0282 anomaly / RFC-0283 trip | human triage → demotion review |
| `demotion-review` | autonomy thermostat fired | human confirms/adjusts level |
| `product-language` | RFC-0277 packaging copy risk | human legal/brand check |

2. **Every intervention is training signal.** A resolved escalation writes back: the human verdict enters the RFC-0279 golden set, updates RFC-0278 calibration, and (where the fix belongs to a fact) is pushed down into the record (Fable §E.7 "fix the fact, not the phrasing") so every language inherits it. An intervention that does not reduce future interventions of its kind is a smell to investigate.

3. **The budget shrinks and is a KPI.** `escalation.queue.report` tracks **human-minutes per 1000 published pages** per scope and per fleet (RFC-0284). A scope may reach RFC-0278 L4 only when this metric is at/near zero over a sustained window with no defect resurgence. `escalation.budget.validate` fails loudly if required escalations exceed available budget — the system blocks, it never bypasses a human by auto-approving under pressure.

## Architectural fit

- RFC-0278 is the ladder; this RFC governs the human side of every rung and defines the metric that unlocks the top.
- RFC-0279 abstentions are the primary feeder of the queue; resolved escalations grow its golden set.
- RFC-0282/0283 anomalies and trips are the safety feeders; RFC-0284 aggregates all queues into one fleet queue and reports the fleet KPI.
- RFC-0276 Bordbuch records escalations opened/closed as missions; RFC-0218 CKL agent operating model is the behavioral frame this policy extends from RFC lifecycle to content operations.
- RFC-0277 review-economics proof gate consumes the human-minutes metric as its cost input.

## Design

### CLI surface

```sh
pnpm exec werkstatt run escalation.queue.report --app warpgogol-com --json
pnpm exec werkstatt run escalation.route --app warpgogol-com --reason claims-class --artifact <ref> --json
pnpm exec werkstatt run escalation.budget.validate --app warpgogol-com --json
```

### TypeScript contracts

```ts
export type EscalationReason =
  | "low-reviewer-confidence" | "novel-template" | "claims-class"
  | "anomaly" | "demotion-review" | "product-language";

export interface Escalation {
  id: string;
  scope: string;                    // RFC-0278 scope
  reason: EscalationReason;
  artifactRef?: string;
  openedAt: string;
  resolvedAt?: string;
  resolvedBy?: { kind: "human"; handle: string };
  verdict?: "approve" | "reject" | "fix-record";
  minutesSpent?: number;
  feedback: { toGolden?: boolean; toCalibration?: boolean; toRecord?: string };
}

export interface EscalationBudget {
  scope: string;
  windowDays: number;
  humanMinutesAvailable: number;
  humanMinutesUsed: number;
  minutesPer1000Pages: number;      // the trajectory KPI
}
```

### File system responsibilities

| Path                                                      | Role                              |
| --------------------------------------------------------- | --------------------------------- |
| `apps/<app>/src/surface/escalations.ndjson`               | Append-only escalation log        |
| `apps/<app>/src/surface/escalation-budget.generated.json` | Per-scope budget + KPI projection |

### Validation rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `ESC-01` | error | Required escalation exceeds available budget and the system auto-approved instead of blocking |
| `ESC-02` | error | A resolved escalation produced no feedback (`toGolden`/`toCalibration`/`toRecord` all empty) |
| `ESC-03` | warning | An escalation reason recurs at a rate inconsistent with a shrinking budget |
| `ESC-04` | error | A scope claims L4 while its `minutesPer1000Pages` is above the near-zero threshold |
| `ESC-05` | error | An escalation carries a raw log/PII payload instead of a decision reference |

## Failure modes

- Budget exhausted with a claims escalation pending: `ESC-01` blocks; the artifact stays `draft`; nothing auto-approves. The block is the safe outcome.
- Escalation resolved without feedback: `ESC-02` error — an intervention that teaches nothing is wasted human time.
- Reason recurs (queue not shrinking): `ESC-03` warning prompts a root-cause fix (better prompt, better glossary, better record), not more staffing.
- L4 claimed with non-trivial human minutes: `ESC-04` error — the autonomy claim is not yet earned.

## Rollout

1. Add the `Escalation` log and `escalation.route`; feed it from RFC-0279 abstentions and RFC-0272 novel-template gates.
2. Add `escalation.queue.report` with the human-minutes-per-1000-pages KPI per scope.
3. Wire resolved escalations back into the RFC-0279 golden set, RFC-0278 calibration, and records (fix-the-fact).
4. Add `escalation.budget.validate`; make `ESC-01` a hard block (exhaustion never bypasses a human).
5. Converge all site queues into the RFC-0284 fleet queue; report the fleet KPI.
6. Gate RFC-0278 L4 on the KPI reaching near-zero with no defect resurgence.

## Alternatives considered

- **Keep human review as a standing default.** Rejected: it is the throughput ceiling (Fable §B6) and never measures itself, so it can neither shrink nor prove the AI-only goal.
- **Cap human review by headcount only.** Rejected: a raw cap without feedback produces rubber-stamping; the budget must be coupled to calibration so it shrinks by getting _better_, not by getting _lazier_.
- **Auto-approve when the queue is full.** Rejected: exhaustion must block, never bypass; `ESC-01` is a hard error.
- **Track effort but not require feedback.** Rejected: an intervention that does not reduce future interventions is pure cost; `ESC-02` makes the learning loop mandatory.

## Risks

- **Under-staffing masquerading as autonomy** (KPI low because nobody is reviewing, not because quality is high). Mitigation: the KPI is only meaningful alongside RFC-0282 defect-escape and RFC-0283 trip rates; low minutes _with_ rising defects triggers demotion, not promotion.
- **Gaming the taxonomy** to hide claims work in a cheaper reason. Mitigation: `claims-class` is derived from field-class (RFC-0278), not chosen by the router.
- **Feedback overhead** slowing reviewers. Mitigation: feedback capture is structured and lightweight; fixing the record once beats fixing N translations.

## Acceptance criteria

- [x] `Escalation`, `EscalationReason`, and `EscalationBudget` types exist. (evidence: implemented historically)
- [x] `escalation.queue.report`, `escalation.route`, and `escalation.budget.validate` are registered. (evidence: implemented historically)
- [x] Human involvement is invoked only through typed escalations, not as a standing default. (evidence: implemented historically)
- [x] Resolved escalations feed the RFC-0279 golden set, RFC-0278 calibration, and records; feedback is mandatory (`ESC-02`). (evidence: implemented historically)
- [x] Human-minutes-per-1000-pages is reported per scope and per fleet. (evidence: implemented historically)
- [x] Budget exhaustion blocks rather than auto-approves (`ESC-01`), and L4 requires a near-zero KPI (`ESC-04`). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Escalate genuine exceptions only; never route raw logs, non-decisions, or PII into the human queue (`ESC-05`).
- Every human touch must teach the system: write feedback to golden/calibration/record, and prefer fixing the underlying fact so all languages inherit the correction.
- Treat a non-shrinking queue as a bug in the machine, not a reason to hire; fix the prompt, glossary, or record.
- Never bypass a required human by auto-approving under budget pressure; blocking is the safe failure.
