---
id: RFC-0255
title: "Record pipeline step timing and timeout telemetry"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0245
  - RFC-0249
  - RFC-0251
  - RFC-0253
  - RFC-0254
commands:
  proposed:
    - pipeline.timing.report
    - pipeline.timeout.validate
  added:
    - pipeline.timing.report
    - pipeline.timeout.validate
  changed:
    - packages-check.run
    - packages.check
    - apps-check.run
    - apps-check.author
    - apps-check.postbuild
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every Site OS pipeline result can show per-step duration, slowest steps, total wall time, and timeout status in JSON output."
  - "Human pipeline output ends with a compact timing summary for long-running app build/check sessions."
  - "`pipeline.timeout.validate` reports commands or pipeline steps that have no explicit timeout budget once timeout metadata is adopted."
  - "Future agents can distinguish a genuinely hung step from a long but healthy app build/check run."
nonGoals:
  - "Do not optimize build performance in this RFC; measure first."
  - "Do not replace Turborepo caching or GitHub Actions timing data."
  - "Do not persist large per-run telemetry files by default."
  - "Do not make timing values deterministic or commit timing outputs."
---

# RFC-0255: Record pipeline step timing and timeout telemetry

## Context

The 2026-07-01 audit found that root `pnpm build:check` exceeded a 20 minute agent command timeout. The follow-up investigation showed that this was not a code failure:

- `nicaragua-projekt` app-level `build:check` completed successfully in roughly seven minutes.
- `webgogol-com` app-level `build:check` completed successfully in roughly nine and a half minutes.
- The combined root command plus orchestration overhead simply needed a larger timeout.

The important discovery is not "make the timeout bigger." The discovery is that the platform currently does not make long-running pipeline behavior explicit enough. A human or agent must infer where time went by reading a long stream of output.

RFC-0254 addresses log noise. This RFC addresses time visibility and timeout contracts.

## Problem

The unprotected invariant is: **long-running pipeline work must report where time went and which timeout budget applied.**

Without per-step timing and timeout telemetry:

- Agents may kill healthy commands because there is no progress summary.
- Maintainers cannot tell whether a build got slower because of Astro, a generator, media variants, app checks, or postbuild validation.
- CI timeout choices drift from real command behavior.
- Slow steps stay invisible until they become painful.
- Root-level commands that span multiple apps look hung even when they are making progress.

For a multi-client site factory, the system needs a reliable sense of operational tempo.

## Decision

The Site OS pipeline runner will collect timing telemetry for every command step it executes.

Telemetry must be available in:

1. JSON command results, for agents and CI post-processing.
2. Human-readable end-of-pipeline summaries, for local review.
3. A dedicated timing report command, for focused investigations.
4. Timeout validation, once command and pipeline metadata define expected budgets.

The platform will add two commands:

- `pipeline.timing.report`
- `pipeline.timeout.validate`

`pipeline.timing.report` exposes recent or actively executed timing summaries.

`pipeline.timeout.validate` verifies that long-running commands and pipeline steps have explicit timeout metadata and that configured timeout budgets are coherent.

## Architectural fit

This RFC belongs in the Site OS runtime layer:

- `@gogol/site-kernel` owns command and pipeline execution.
- `@gogol/site-kernel-checks` owns validation commands and package pipeline wiring.
- RFC-0254 makes output readable.
- RFC-0255 makes long-running behavior measurable.
- RFC-0249 and RFC-0251 keep CI/local gates aligned; timing metadata should eventually inform those gates.

This RFC does not replace Turborepo. It measures Site OS pipeline steps inside each package/app command.

## Design

### CLI surface

```sh
pnpm exec site-kernel run pipeline.timing.report --json
pnpm exec site-kernel run pipeline.timeout.validate --json
pnpm --filter webgogol-com build:check
pnpm --filter nicaragua-projekt build:check
```

Optional future flags:

```sh
pnpm exec site-kernel run pipeline.timing.report --app webgogol-com --pipeline build.check --json
pnpm exec site-kernel run pipeline.timing.report --last-run --json
pnpm exec site-kernel run pipeline.timeout.validate --strict --json
```

The first implementation may emit timing telemetry directly from each pipeline result without persisting a `--last-run` store. Persistence is optional and should be added only if useful.

### Telemetry contract

```ts
type PipelineStepStatus = "pass" | "warn" | "fail" | "skipped" | "timeout";

interface PipelineStepTiming {
  pipeline: string;
  command: string;
  app?: string;
  packageName?: string;
  status: PipelineStepStatus;
  startedAtMonotonicMs: number;
  endedAtMonotonicMs: number;
  durationMs: number;
  timeoutMs?: number;
  exceededTimeout: boolean;
  fromCache?: boolean;
}

interface PipelineTimingSummary {
  pipeline: string;
  app?: string;
  totalDurationMs: number;
  stepCount: number;
  slowestSteps: PipelineStepTiming[];
  timeoutCount: number;
  warningCount: number;
  failedStep?: string;
}
```

Rules:

- Use monotonic timers for duration calculation.
- Do not use wall-clock timestamps for committed artifacts.
- Human output may print rounded durations.
- JSON output should include raw milliseconds.
- A step that exits before its timeout but exceeds an advisory threshold is slow, not timed out.
- A timed-out step must be represented as a structured failure with command name and timeout budget.

### Timeout metadata contract

Timeout metadata should be attached to command registrations or pipeline step descriptors, not hidden in ad hoc shell invocations.

Illustrative shape:

```ts
interface KernelCommandMetadata {
  name: string;
  description: string;
  scope: "workspace" | "app";
  timeoutMs?: number;
  expectedDurationMs?: number;
  longRunning?: boolean;
}

interface PipelineStepDescriptor {
  command: string;
  timeoutMs?: number;
  expectedDurationMs?: number;
}
```

Rules:

- Long-running steps should declare `timeoutMs`.
- Fast validators may omit `timeoutMs` during the first rollout but should inherit a default.
- Media generation, app `build:check`, Astro build, and postbuild validation need explicit budgets.
- Timeout metadata is a contract for local agents and CI wrappers; it is not a performance guarantee.

### Human summary contract

A long pipeline should end with a concise timing summary:

```txt
== webgogol-com: build:check timing ==
[OK] total 9m 26s, 123 check step(s), 0 timeout(s)
slowest:
  1. astro build                 3m 12s
  2. build.check                 2m 37s
  3. build.prepare               1m 18s
  4. apps-check.author subset      44s
  5. dist.generated-marker         31s
  6. content references            28s
```

If RFC-0254 is implemented first, this summary should appear after grouped notices and before final status.

### JSON result contract

Every pipeline execution result may include:

```ts
interface KernelPipelineResultData {
  command: string;
  status: "pass" | "warn" | "fail";
  subResults: unknown[];
  timing?: PipelineTimingSummary;
}
```

For command execution:

```ts
interface KernelCommandResult<TData = unknown> {
  ok: boolean;
  exitCode: number;
  summary?: string;
  data?: TData;
  timing?: {
    durationMs: number;
    timeoutMs?: number;
    exceededTimeout: boolean;
  };
}
```

### Timeout validator

`pipeline.timeout.validate` checks metadata, not live duration.

Initial rule ids:

- `PIPELINE-TIMEOUT-01`: long-running command has no timeout metadata.
- `PIPELINE-TIMEOUT-02`: pipeline step timeout is lower than command expected duration.
- `PIPELINE-TIMEOUT-03`: app build/check wrapper timeout is lower than the sum of configured critical steps.
- `PIPELINE-TIMEOUT-04`: command metadata declares impossible values such as negative duration or timeout lower than zero.

First rollout severity may be warning for missing metadata outside Tier 0 runtime commands. Once coverage is complete, missing timeout metadata can become fail-hard for long-running build paths.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/runtime.ts` | Collects per-command and per-pipeline timing |
| `packages/os/site-kernel/src/types.ts` | Adds timing and timeout metadata types |
| `packages/os/site-kernel/src/registry.ts` | Stores command metadata if not already available elsewhere |
| `packages/os/site-kernel-checks/src/pipeline-timing-report.ts` | Implements `pipeline.timing.report` |
| `packages/os/site-kernel-checks/src/pipeline-timeout-validate.ts` | Implements `pipeline.timeout.validate` |
| `packages/os/site-kernel-checks/src/pipelines/*.ts` | Adds or consumes per-step timeout/expected-duration metadata |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Registers `PIPELINE-TIMEOUT-*` rule ids |
| `.github/workflows/ci.yml` | Eventually uses timeout budgets consistently with local gate expectations |

## Rollout

1. Add timing fields to `executeKernelCommand` and `executeKernelPipeline` return objects without changing exit behavior.
2. Add tests that prove timing is captured for passing, failing, and skipped commands.
3. Add human timing summaries for pipelines whose total duration exceeds a threshold such as 30 seconds.
4. Add `pipeline.timing.report` as a read-only command.
5. Add timeout metadata fields to command/pipeline descriptors.
6. Add `pipeline.timeout.validate` in warning mode.
7. Add explicit timeout budgets for the longest known paths:
   - app `build.prepare`;
   - app `build.check`;
   - Astro check/build wrappers;
   - app `build.post`;
   - root package checks;
   - media variant generation.
8. Promote missing timeout metadata to fail-hard only after coverage is complete.

## Best project decision

The best first implementation is measurement without enforcement.

Do not begin by optimizing or changing timeouts. First make every pipeline explain itself: how long it ran, which steps were slow, which timeout was in force, and whether the command was healthy.

Once that visibility exists, optimization work can be precise. For example, if `webgogol-com build:check` is slow because of Astro build, that is a different project than if it is slow because of surface generation or postbuild SEO validation.

## Alternatives considered

Relying on GitHub Actions timestamps was rejected because local agents and app-level commands need the same view, and GitHub timing is too coarse for Site OS substeps.

Increasing all timeouts was rejected because it hides the difference between slow and stuck.

Persisting every timing run to committed files was rejected because timing is environment-dependent and would create useless churn.

Profiling only Astro builds was rejected because Site OS generators and validators are equally important in this architecture.

## Risks

Timing values are environment-dependent. They must not become deterministic build artifacts or committed snapshots.

Adding timeout enforcement too early can break legitimate client-site builds. Start with reports and warning-mode validation.

Instrumentation can clutter output if RFC-0254 is not implemented. Keep summaries compact and show details in JSON.

Wrappers around external commands may not expose fine-grained child timings. The first rollout can time the wrapper step and refine later.

## Acceptance criteria

- [x] Pipeline execution captures duration for every Site OS command step. (evidence: implemented historically)
- [x] Pipeline JSON output exposes a `timing` summary with total duration and slowest steps. (evidence: implemented historically)
- [x] Long-running human output includes a compact end-of-pipeline timing summary. (evidence: implemented historically)
- [x] `pipeline.timing.report` is registered as a workspace command. (evidence: implemented historically)
- [x] Command or pipeline metadata can declare `timeoutMs` and `expectedDurationMs`. (evidence: implemented historically)
- [x] `pipeline.timeout.validate` is registered as a workspace command and reports missing or incoherent timeout metadata. (evidence: implemented historically)
- [x] Tests cover passing, failing, skipped, and timed-out step timing behavior. (evidence: implemented historically)
- [x] App-level `build:check` for both active apps still passes. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run packages-check.run --json`, `pnpm exec site-kernel run ci.local.validate --json`, `pnpm test`, and `rfc.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes because this RFC is accepted.
- Prefer implementing RFC-0254 first when possible, but this RFC can still add JSON timing before log-hygiene output changes.
- Do not commit timing reports unless a later RFC defines a stable generated artifact.
- Do not tune performance until telemetry identifies the slow path.
- Commit after each completed implementation step. Do not push from agent sessions.
- After adding commands or changing pipeline metadata surfaces, run `ecosystem.manifest.generate`; do not hand-edit the Agent Control Plane.
