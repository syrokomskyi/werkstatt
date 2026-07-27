---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: HEAD...working-tree
filesReviewed:
  - packages/observability/src/otlp-converter.ts
  - packages/observability/src/typed-refs.ts
  - packages/observability/src/tests/otlp-converter.test.ts
  - packages/observability/src/index.ts
  - packages/observability/src/pusher.ts
  - packages/os/site-kernel/src/runtime/telemetry.ts
  - services/fleet-probe-runner/src/loop.ts
  - services/cf-analytics-poller/src/loop.ts
  - packages/os/site-kernel-observability/src/commands/factory-smoke.ts
  - packages/os/site-kernel-observability/src/commands/stack-health.ts
---

# Code Review: @gogol/observability deepening — uncommitted working tree

### Verdict: Needs revision

The extraction of `convertAccumulatedToOtlp` and the registry-based dispatch fix are structurally sound and well-tested. However, `typed-refs.ts` duplicates all 14 metric specs (names + label keys) from `metric-registry.ts` in direct contradiction of its own non-goals block ("Do not duplicate metric specs — derive from metric-registry.ts"), creating a manual drift surface that the existing `observability.conventions.validate` command does not guard against.

### Mechanical floor

Pass — `tsc --noEmit` passes for `@gogol/observability`, `@gogol/site-kernel`, `@gogol/site-kernel-observability`, `fleet-probe-runner`, and `cf-analytics-poller`. Vitest passes for `@gogol/observability`.

### Axis A — Structural correctness

1. **DRY violation in `typed-refs.ts`** — The `METRIC_REFS` object hand-duplicates all 14 metric names and their label key arrays from `WGOGOL_METRIC_REGISTRY` in `metric-registry.ts`. The module's own non-goals state "Do not duplicate metric specs — derive from metric-registry.ts", but the implementation does not import or derive from the registry at all. Adding a new metric to the registry requires a matching manual entry in `typed-refs.ts`; forgetting one means the new metric is silently unavailable through the typed surface with no build-time or validation-time failure. This is the most serious finding in the diff.

2. **Unused `labelKeys` parameters** — `defineCounter`, `defineGauge`, and `defineHistogram` each accept a `labelKeys: L` parameter that is never read at runtime. The parameter exists solely for TypeScript literal type inference via `as const` call-site assertions. This is a common TypeScript pattern and acceptable, but the parameter names could be prefixed with `_` to signal intent to linters and agents.

3. **Speculative barrel exports** — `convertAccumulatedToOtlp` and `AccumulatedPoint` are exported from the package barrel (`index.ts`) but have no external consumer. They are used only by `pusher.ts` (internal) and the test file (internal). These exports are speculative generality — the pure function could be part of the public API in the future, but right now it adds surface area without a consumer.

### Axis B — DNA alignment

No issues. The diff does not touch any DNA invariant:

- **DNA-1** — No `apps/* → apps/*` or `apps/* → services/*` imports. All imports flow `services/* → packages/*` and `packages/os/* → packages/*`.
- **DNA-6** — New filenames use kebab-case: `otlp-converter.ts`, `typed-refs.ts`, `otlp-converter.test.ts`.
- **DNA-42** — Both new source files carry `MODULE_CONTRACT` (with `<purpose>` and `<non-goals>`) and `CHANGE_SUMMARY` blocks.

### Axis C — Ecosystem fit

1. **OBS-CONV-01 blind spot** — The `observability.conventions.validate` command (OBS-CONV-01) scans for `wgogol_*` string literals in files containing `pusher.*` calls. Consumer files that migrate to `METRIC_REFS.wgogol_factory_command_runs_total.add(pusher, ...)` no longer contain `wgogol_*` string literals or direct `pusher.*` calls, so the validator skips them entirely. This is safe — TypeScript's type system enforces the same constraint at compile time — but the validator's OBS-CONV-01 check becomes a no-op for files using `METRIC_REFS`. The validator should be updated to also scan for `METRIC_REFS.wgogol_*` property accesses, or the OBS-CONV-01 rule should be documented as "applies to string-literal call sites only; typed-ref consumers are type-checked."

2. **No Compass sync needed** — The diff does not change repository-wide requirements, shared package contracts, or app-package relationships. No `docs/*.xml` updates are required.

### Axis D — Forward-only compliance

No issues. The change is forward-only:

- The inline OTLP conversion code in `pusher.ts` is deleted, not kept behind a flag.
- The `includes("_total")` string heuristic in `cf-analytics-poller` is replaced, not preserved.
- Consumer files are updated to use `METRIC_REFS` directly — no compatibility shim or dual-path.

### Axis E — Agent-facing clarity

1. **Non-goals contradict implementation** — `typed-refs.ts` line 6: `<item>Do not duplicate metric specs — derive from metric-registry.ts.</item>` The implementation does not derive from `metric-registry.ts` — it independently declares all metric names and label keys. An agent reading the non-goals would assume the module imports from the registry and would be confused by the actual implementation. The non-goals should be corrected to describe the actual design decision: "Metric names and label keys are duplicated as `as const` literals for TypeScript type inference; the registry remains the runtime authority."

2. **No `@ai-invariant` lines** — Neither new file carries `@ai-invariant` lines. `otlp-converter.ts` contains the histogram bucketing algorithm (the most complex logic in the package) — an invariant like `@ai-invariant: bucket boundaries are inclusive (value <= bound goes in the lower bucket)` would help future agents understand the semantics without reading the loop.

3. **Unrelated formatting changes** — `telemetry.ts` and `stack-health.ts` contain formatting changes (signature reformatting, return-type line wrapping) unrelated to the observability deepening. These are likely Prettier auto-formatting artifacts but expand the diff scope.

### Axis F — Pragmatism

1. **Parallel declaration surface** — `METRIC_REFS` introduces a second hand-maintained declaration surface for metric names and label keys. The registry (`metric-registry.ts`) is the authoritative source, but `typed-refs.ts` is a parallel copy that must be kept in sync manually. A code-generation step (generating `typed-refs.ts` from the registry) or a compile-time type assertion (verifying `METRIC_REFS` keys ⊆ registry names) would eliminate the drift risk without sacrificing type safety.

2. **`cf-analytics-poller` dispatch fallback** — `const kind = spec?.kind ?? "counter"` defaults to `"counter"` when a metric is not found in the registry. This is safe because the pusher drops unregistered metrics, but the fallback could mask a registry drift scenario where a metric name is misspelled in the poll transform. A stricter approach (`if (!spec) continue` — skip unregistered metrics) would fail more visibly.

### Axis G — Blind spots

1. **OBS-CONV-01 coverage gap** — As noted in Axis C, the validator cannot see metric names accessed through `METRIC_REFS` property access. If a typo is introduced in a `METRIC_REFS` property name, TypeScript catches it at compile time, but the validator's OBS-CONV-01 check does not. This is a false-negative risk for the validator, not for the code itself.

2. **Histogram bucket boundary semantics** — The `otlp-converter.ts` histogram bucketing uses `value <= bounds[i]` (inclusive lower bucket). The test at line 89 verifies this (`value: 1` goes into `bucketCounts[1]`, not `bucketCounts[2]`). This is correct OTLP semantics but is not documented as an `@ai-invariant`.

3. **No PBT coverage for `convertAccumulatedToOtlp`** — DNA-41 encourages property-based testing for pure functions with verifiable algebraic properties. `convertAccumulatedToOtlp` is a pure function with an idempotency-like property: converting the same input twice produces structurally identical output (modulo `timeUnixNano` which changes per call). A PBT test could verify that the grouping is stable and that bucket counts sum to the total count.

### Spec compliance

No spec available — spec compliance skipped. The diff originates from an architecture review (`architecture-review-20260710-observability.html`) that identified three deepening candidates. All three are implemented.

### Questions for the author

1. **`typed-refs.ts` drift**: How will you ensure `METRIC_REFS` stays in sync with `WGOGOL_METRIC_REGISTRY`? A compile-time assertion (`keyof typeof METRIC_REFS extends typeof WGOGOL_METRIC_REGISTRY[number]["name"]`) or a validation command would close the gap. What is the plan?
2. **Non-goals correction**: The non-goals in `typed-refs.ts` say "derive from metric-registry.ts" but the implementation duplicates. Should the non-goals be corrected to describe the actual design, or should the implementation be changed to derive?
3. **OBS-CONV-01 coverage**: Now that consumers use `METRIC_REFS` instead of string literals, `observability.conventions.validate` can no longer verify that consumer-side metric names are declared. Should the validator be updated to scan for `METRIC_REFS.wgogol_*` property accesses, or is compile-time type safety considered sufficient?
