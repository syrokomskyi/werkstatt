---
id: RFC-0270
title: "Derive pipeline timing budgets from telemetry"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0255
commands:
  proposed:
    - pipeline.budget.generate
  added:
    - pipeline.budget.generate
  changed:
    - pipeline.timeout.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "expectedDurationMs values stop being hand-guessed constants: budgets derive from recorded RFC-0255 telemetry percentiles."
  - "pipeline.timeout.validate flags steps whose hand-set expectations drifted far from observed reality, and long steps with no budget at all."
  - "Agents can distinguish a hung step from a slow-but-healthy one using budgets grounded in this machine's actual history."
nonGoals:
  - "Do not commit raw per-run telemetry; only the aggregated budget file is committed."
  - "Do not auto-tune timeoutMs (the hard kill limit) — only expected-duration budgets; kill limits stay human-set."
  - "Do not make budgets a build gate; exceeding an expected duration is telemetry, not failure."
---

# RFC-0270: Derive pipeline timing budgets from telemetry

## Context

Part C of the 2026-07-02 AEO audit series (check quality; see rfc-0258 for series order). Builds directly on RFC-0255, which gave every pipeline step timing telemetry and added `pipeline.timing.report` / `pipeline.timeout.validate`.

Pipeline definitions carry hand-written estimates, for example in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`: `preview.images.generate` (`expectedDurationMs: 30_000`), `image.variants.generate` (`60_000`), `video.variants.generate` (`180_000`, `timeoutMs: 1_200_000`). These numbers were guesses at authoring time and have no mechanism to track reality as apps grow (PSEO pages, more media). A stale expectation is a false signal — and agents act on false signals: an agent seeing a step at 4x its "expected" duration may kill a healthy build (the exact incident that motivated RFC-0255).

## Problem

The unprotected invariant is: **an expected-duration signal shown to agents must reflect observed behavior, not the author's original guess.** Today nothing updates `expectedDurationMs`, nothing compares it against telemetry, and steps added without any estimate stay invisible until they hang.

## Decision

1. The RFC-0255 telemetry collector additionally appends per-step records to a local, gitignored history at `node_modules/.cache/site-kernel/telemetry/steps.ndjson` (append-only, size-capped at 5 MB with FIFO truncation).
2. A new `pipeline.budget.generate` command aggregates that history and writes `docs/pipeline-budgets.generated.json` (marker, deterministic given the same history input, `generatedAt: null`; the input snapshot hash recorded in `meta`). Budget per (pipeline, command, app): `p50`, `p95`, `sampleCount`, and `expectedDurationMs = ceil(p95 * 1.5)` rounded to seconds.
3. The pipeline runner prefers a budget-file entry over the inline `expectedDurationMs` when both exist; inline values become the cold-start fallback for steps without samples.
4. `pipeline.timeout.validate` gains two rules: `TIME-01` (warning) — an inline `expectedDurationMs` deviates from the generated budget by more than 4x in either direction (stale guess); `TIME-02` (warning) — a step with observed p95 over 30 seconds has neither an inline estimate nor a budget entry.

## Architectural fit

- Pure extension of RFC-0255: same collector, same validate command, one new generator following the RFC-0081 marker + deterministic-projection discipline (`docs/maintenance-debt.queues.generated.json` is the template).
- The budget file is advisory context for agents and the runner's progress display; it never gates builds — consistent with RFC-0255's "measure first" stance.

## Design

### CLI surface

```sh
pnpm exec site-kernel run pipeline.budget.generate            # aggregate local history → budgets file
pnpm exec site-kernel run pipeline.budget.generate --dry-run
pnpm exec site-kernel run pipeline.timeout.validate --json    # now includes TIME-01 / TIME-02
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/pipeline-budgets.ts (new)
export interface StepTelemetryRecord {
  pipeline: string; command: string; app: string | null;
  durationMs: number; timedOut: boolean; recordedAt: string; // ISO, stays in ndjson only
}
export interface StepBudget {
  pipeline: string; command: string; app: string | null;
  sampleCount: number; p50Ms: number; p95Ms: number; expectedDurationMs: number;
}
export interface PipelineBudgetsFile {
  generatedMarker: string;
  meta: { schemaVersion: 1; deterministic: true; generatedAt: null; historyHash: string };
  budgets: StepBudget[]; // sorted by pipeline, command, app
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `node_modules/.cache/site-kernel/telemetry/steps.ndjson` | Gitignored raw history (collector appends) |
| `docs/pipeline-budgets.generated.json` | Committed aggregated budgets (generator output, atomic write per rfc-0258) |
| `packages/os/site-kernel/src/pipeline-budgets.ts` | Aggregation + runner lookup |
| `packages/os/site-kernel-checks/src/pipeline-telemetry` modules | TIME-01/TIME-02 wiring in pipeline.timeout.validate |

### Output format

`pipeline.budget.generate` reports budgets written/updated and steps still without samples. `pipeline.timeout.validate --json` emits standard `CheckResult` with the two new warning rules; both carry fixHints ("re-run pipeline.budget.generate after a representative build" / "add expectedDurationMs or gather samples").

### Failure modes

Warnings only for TIME-01/TIME-02 (advisory by design). `pipeline.budget.generate` with an empty history exits 0 with an explanatory summary and writes nothing (never emits an empty budgets file over a populated one).

## Rollout

1. Land collector persistence + generator + runner lookup + validate rules.
2. Run three representative builds locally (`build:check` both apps), generate and commit the first budgets file.
3. Refresh cadence: regenerate opportunistically when TIME-01 fires or after adding a heavy pipeline step; no scheduled churn.
4. Inline `expectedDurationMs` values stay in pipeline definitions as documented cold-start fallbacks; do not delete them.

## Alternatives considered

- **Committing raw telemetry**: rejected — non-deterministic, machine-specific, unbounded growth; only the aggregate is shared.
- **Auto-tuning `timeoutMs` kill limits**: rejected — a corrupted or unlucky history could lower a kill limit and abort healthy builds; hard limits remain human-owned.
- **CI-sourced budgets**: deferred — CI and dev-machine profiles differ; local budgets serve the local agent, and a CI dimension can be added to the record shape later (`schemaVersion` covers it).

## Risks

- Budgets encode one machine's history; a slower machine sees inflated "over budget" impressions. Acceptable: budgets are advisory and per-repo-clone regenerable; the `sampleCount` field lets consumers judge confidence.
- History file corruption (partial ndjson line after a crash): the aggregator skips unparseable lines and reports the skip count.

## Acceptance criteria

- [x] Unit tests written BEFORE implementation: aggregation over a fixture ndjson produces expected p50/p95/expected values (golden); unparseable-line skip; empty-history no-op; deterministic output for identical history. (evidence: implemented historically)
- [x] Collector appends step records during any pipeline run; file capped at 5 MB FIFO. (evidence: implemented historically)
- [x] `pipeline.budget.generate` registered; output file marker-carrying, atomically written, committed after three representative builds. (evidence: implemented historically)
- [x] Runner progress display and `pipeline.timing.report` prefer budget entries over inline estimates (visible in output). (evidence: implemented historically)
- [x] `TIME-01`/`TIME-02` implemented in `pipeline.timeout.validate` with red/green fixtures (satisfies rfc-0261). (evidence: implemented historically)
- [x] Rule ids registered with fixHints. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

**As-built, 2026-07-02:** the RFC-0255 groundwork turned out to have no single collector hook — pipeline steps actually execute through TWO independent drivers: `@gogol/site-kernel`'s `executePipelineForApp`/`executePipelineForWorkspace` (used by `executeKernelPipeline`), and a separate `runCommandSequence` in `@gogol/site-kernel-checks/module.ts` (used by the composite `packages.check`/`packages-check.run`/`apps-check.*` commands, which call `executeKernelCommand` per step rather than reusing the pipeline executor). Both were wired with `appendStepTelemetry` + `lookupExpectedDurationMs` — missing either would have silently starved telemetry for the exact pipelines agents run daily. `pipeline-budgets.ts` lives in `@gogol/site-kernel` per the Design section's file table; `workspace.write.boundary.lint`'s WS-WRITE-02 check needed a small fix (RFC-0270 note in its own file) — its `writeFileAtomic`-import regex only recognized the `"@gogol/site-kernel"` package specifier, which false-failed a module that lives inside that very package and must import the sibling `./fs-atomic.ts` directly; broadened to accept both forms, with a fixture test locking in the new branch. The first real `docs/pipeline-budgets.generated.json` was generated from 3 representative `packages.check` runs (55 budgets, 3 samples each); a follow-up run confirmed the runner's `pipeline.timing.report` and progress display now surface budget-derived `expectedDurationMs` values for steps that previously had none (e.g. `maintenance.debt.baseline.validate`: none → `13000`). One genuine `TIME-02` warning surfaced immediately (`ecosystem.manifest.validate`, observed p95 ~102s, no inline fallback) — left as advisory telemetry per this RFC's own nonGoals, not fixed here.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Never hand-edit `docs/pipeline-budgets.generated.json`; regenerate from history. Never commit the ndjson history.
- When TIME-01 flags a stale inline estimate, prefer regenerating budgets over editing the inline constant; only correct the inline value when the step's workload genuinely changed class.
- Treat "step over expected duration" as information, not failure — do not kill running builds based on budgets alone; check `pipeline.timing.report` for progress first (RFC-0255 discipline).
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0270` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
