---
id: RFC-0340
title: "Emit factory telemetry from kernel command runs"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0255
  - RFC-0266
  - RFC-0270
  - RFC-0282
  - RFC-0283
  - RFC-0337
  - RFC-0338
commands:
  proposed: []
  added:
    - observability.factory.smoke
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-observability"
  - "@gogol/observability"
successSignals:
  - "Every kernel command run in CI (and, when env is set, locally) leaves a duration, status, and diagnostics trace in SigNoz, labeled by command name and site, with zero effect on offline determinism."
  - "Build-failure trends, slowest-command trends, and diagnostics-volume trends are queryable over weeks — the substrate the circuit breaker (RFC-0283) and visibility loop (RFC-0282) currently lack."
  - "A build with no network or no telemetry env behaves byte-identically to today."
nonGoals:
  - "Do not emit per-command spans/traces or ship logs; metrics only in v1."
  - "Do not emit Turborepo cache-hit metrics (requires run-summary parsing; deferred to a follow-up RFC)."
  - "Do not persist telemetry locally; no files are written."
  - "Do not replace RFC-0255 pipeline budget metadata; budgets stay the static contract, these metrics are the observed history."
acceptance:
  - probe: command-registered
    name: "observability.factory.smoke"
  - probe: file-contains
    path: "packages/observability/src/metric-registry.ts"
    pattern: "wgogol_factory_command_duration_seconds"
  - probe: run
    command: "site-kernel run observability.conventions.validate --json"
    expect:
      exitCode: 0
---

# RFC-0340: Emit factory telemetry from kernel command runs

## Context

The build-time control plane ("the factory") is where most of this ecosystem's complexity lives: dozens of site-kernel commands compose into standard pipelines (`build.check`, `apps-check.run`, `packages-check.run`; see `pipelines/` in `@gogol/site-kernel-checks`). RFC-0255/RFC-0270 gave commands static timing metadata (expected durations, timeout budgets, observed p95 in generated budgets), and RFC-0203 gave them a canonical Diagnostic envelope. But no run leaves a trace after the console scrolls away: there is no history of failures, durations, or diagnostic volume, so questions like "did build.check get slower this month" or "which validator fails most often" are unanswerable.

RFC-0337 provides the port (`@gogol/observability`, env-gated, fire-and-forget) and RFC-0338 the backend. The factory is the highest-value emitter in the series: for a static-site fleet, the factory produces more operationally interesting events than the runtime does.

## Problem

Kernel command executions are unrecorded. The fleet Leitstand (RFC-0284), the visibility feedback loop (RFC-0282), and the circuit breaker (RFC-0283) all presuppose trend data about factory health that nothing currently produces. Any ad-hoc emitter risks violating two hard constraints: factory commands must stay **offline-deterministic** (RFC-0266) and must **never fail because telemetry failed**.

## Decision

Instrument the **single kernel command execution path** — the code in `@gogol/site-kernel` that invokes a `KernelCommandDefinition.execute` and produces the result envelope (the same choke point that enforces RFC-0255 `timeoutMs`; locate it by finding where `KernelCommandDefinition.timeoutMs`/`expectedDurationMs` are consumed at run time). After each command completes (success, fail, or timeout), if `createMetricsPusher` returns non-null, record three metrics; flush once per process at exit.

### Metric registry additions (`@gogol/observability` `metric-registry.ts`)

| Name | Kind | Labels | Notes |
| --- | --- | --- | --- |
| `wgogol_factory_command_runs_total` | counter | `command`, `status` (`pass` \| `fail` \| `error` \| `timeout`), `site_id` (app-scoped runs only) | one increment per command execution |
| `wgogol_factory_command_duration_seconds` | histogram | `command`, `site_id` (app-scoped only) | buckets `[0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]` |
| `wgogol_factory_diagnostics_total` | counter | `command`, `severity` (`error` \| `warning` \| `info`), `site_id` (app-scoped only) | summed from the result envelope's diagnostics |
| `wgogol_factory_smoke_total` | counter | — | emitted only by `observability.factory.smoke` (declared in RFC-0337) |

`command` label values are kernel command names — a closed, registry-known set (RFC-0266), so cardinality is bounded by construction. Pipeline composite runners (`build.check`, `apps-check.run`, …) count both as their own command name and via their member steps.

### Resource attributes

`service.name: "site-kernel"`, `wgogol.layer: "factory"`, `deployment.environment`: `"ci"` when `process.env.CI` is truthy, else `"development"`; `service.version`: git short SHA when cheaply available (from env `GITHUB_SHA` or skipped — no git subprocess spawning for telemetry).

### Behavioral contract (binding)

- Enabled **only** when both `WGOGOL_OTLP_ENDPOINT` and `WGOGOL_OTLP_TOKEN` are set (RFC-0337); otherwise the instrumentation branch is a no-op costing at most one null check per command.
- One accumulating pusher per process; one `flush()` on process exit (`beforeExit` / end of the CLI entry), 2s timeout, never throws, never retries, never logs more than a single debug line on failure.
- Telemetry MUST NOT change exit codes, command results, JSON output, or ordering. A telemetry bug that could is a P1 defect.
- CI wiring: the two env vars are added as GitHub Actions secrets and exported in workflow env; local developers opt in manually.

### Command `observability.factory.smoke`

Scope: workspace, read-only (remote-write of one test metric), **network, manual-only** (never in pipelines):

```sh
pnpm exec site-kernel run observability.factory.smoke --json
```

Sends `wgogol_factory_smoke_total` +1 through the port and reports `{ delivered, reason }` plus the HTTP status. Exit non-zero when env is present but delivery fails; exit zero with an explanatory diagnostic when env is absent (so the command is safely runnable anywhere).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/**` (command runner) | Instrumentation hook at the single execution choke point. |
| `packages/observability/src/metric-registry.ts` | Gains the three factory metric specs. |
| `packages/os/site-kernel-observability/src/**` | `observability.factory.smoke` implementation. |
| `.github/workflows/**` | Env plumbing for CI (secrets → env). |

## Architectural fit

- **RFC-0266 (offline determinism).** Preserved by the env gate and fire-and-forget contract; the manifest entry for `observability.factory.smoke` declares its network nature.
- **RFC-0255/0270.** Budgets stay the static expectation; these metrics are the observed reality. A later RFC may reconcile observed p95 from SigNoz back into budgets — explicitly out of scope here.
- **RFC-0203.** Diagnostics counting reads the canonical envelope; no per-check special-casing.
- **RFC-0282/0283/0284.** This RFC produces the factory time series those control loops consume; alert rule `factory-build-check-failed` lands in RFC-0342.
- **RFC-0337.** All naming, cardinality, and transport rules come from the port; this RFC adds registry entries and one emitter.

## Design

(Design is fully specified in the Decision section; the instrumentation surface is intentionally one hook + three metrics. No new TypeScript contracts beyond `@gogol/observability`'s existing API are introduced.)

## Rollout

1. Add the three metric specs to the registry (`observability.conventions.validate` must stay green).
2. Locate the kernel command execution choke point (consumer of `timeoutMs`); add the guarded instrumentation + process-exit flush; unit-test with a fake pusher that captures calls (no network in tests).
3. Implement `observability.factory.smoke`; regenerate the command manifest.
4. Add CI env plumbing; verify in one CI run that metrics arrive in SigNoz (query `wgogol_factory_command_runs_total` grouped by `command`); record the query result in the implementing PR.
5. No app or developer action required; local runs stay silent unless a developer exports the env vars.

## Alternatives considered

- **Wrap pipelines only (not individual commands).** Rejected: per-command grain is where diagnosis happens ("which step got slow/red"), and the choke point makes it equally cheap.
- **Emit spans (one trace per pipeline run).** Deferred: valuable, but metrics answer the trend questions first; spans double the wire format surface. A follow-up RFC can add trace emission through the same port.
- **Parse Turborepo run summaries for cache metrics.** Deferred to its own RFC: different data source (`.turbo/runs` files), different lifecycle (post-run parsing), and turbo's summary schema versioning deserves isolated treatment.
- **Local telemetry spool file + batch uploader.** Rejected: introduces state, cleanup, and privacy questions for near-zero benefit over fire-and-forget.

## Risks

- **Instrumentation at the choke point regresses command behavior.** Mitigated: the hook is additive (try/finally around the existing envelope production), covered by existing kernel tests plus new fake-pusher tests; the "never affects results" rule is stated as binding.
- **CI secrets absent → silent gap.** Mitigated: `observability.factory.smoke` in the runbook validates the pipe; the RFC-0342 build-failure alert going quiet for days is itself a visible anomaly on the Leitstand.
- **Composite pipeline double-counting confuses queries.** Mitigated: documented here (composites count as themselves AND their steps); dashboard queries filter by concrete command names.
- **Flush adds seconds to short commands.** Mitigated: 2s hard timeout, single POST per process, and only when env is set.

## Acceptance criteria

- [x] Registry entries added; `observability.conventions.validate` green. (evidence: implemented historically)
- [x] Instrumentation live at the single execution choke point; fake-pusher unit tests prove counts/durations/diagnostics and prove no-op behavior without env. (evidence: implemented historically)
- [x] A telemetry delivery failure demonstrably does not change command exit codes (test with unreachable endpoint). (evidence: implemented historically)
- [x] `observability.factory.smoke` registered, documented as network/manual-only; command manifest regenerated. (evidence: implemented historically)
- [x] CI plumbing merged; one CI run's metrics visible in SigNoz and referenced in the implementing PR. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence.
- Find the choke point by tracing where `KernelCommandDefinition.timeoutMs` is enforced at run time; do not instrument per-command modules.
- Never let telemetry alter results: wrap in try/catch, no awaits on the hot path except the single exit-time flush.
- Do not add new env variable names; use the RFC-0337 port exclusively via `createMetricsPusher`.
- Tests must not perform network I/O; inject a fake pusher.
