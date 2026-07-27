# @gogol/observability — Agent Guide

## Scope

This package is the **observability port** (RFC-0337): a zero-dependency, Workers-compatible OTLP/HTTP JSON metrics push client with a closed metric registry.

- All metric emission in the ecosystem goes through `createMetricsPusher` or `METRIC_REFS`.
- No `node:` imports — must run in Cloudflare Workers.
- No retry, no batching timers — one `flush()` = at most one HTTP POST.

## Architecture

| Module | Responsibility |
| --- | --- |
| `conventions.ts` | Resource attributes, environment/layer enums, forbidden label keys. |
| `metric-registry.ts` | Closed `WGOGOL_METRIC_REGISTRY` — every metric emitted anywhere MUST be declared here. `findMetricSpec` for kind lookup. |
| `otlp-json.ts` | OTLP JSON envelope encoding, `nowUnixNano`, point types. |
| `otlp-converter.ts` | Pure `convertAccumulatedToOtlp(points, startTimeNano)` — groups by name, converts to OTLP points by kind. No HTTP, no validation. |
| `pusher.ts` | `createMetricsPusher` — accumulates points, validates names/labels, flushes via HTTP POST. Uses `convertAccumulatedToOtlp` for conversion. |
| `typed-refs.ts` | `METRIC_REFS` — typed metric references for compile-time label-key safety. Each key matches a registry entry (enforced by compile-time type assertion). |
| `redact.ts` | URL redaction for safe logging. |

## Consumer contract

Consumers MUST use `METRIC_REFS` for compile-time label safety:

```ts
import { METRIC_REFS } from "@gogol/observability";
METRIC_REFS.wgogol_factory_command_runs_total.add(pusher, 1, { command: "build.check", status: "pass" });
```

Dynamic metric names (e.g. from poll transforms) use `findMetricSpec` for kind lookup:

```ts
import { findMetricSpec } from "@gogol/observability";
const spec = findMetricSpec(point.metric);
if (!spec) continue;
```

## Validation

- `observability.conventions.validate` (OBS-CONV-01..05) scans for undeclared metric names in both string-literal pusher calls and `METRIC_REFS.*` property accesses.
- Compile-time type assertion in `typed-refs.ts` ensures `METRIC_REFS` keys ⊆ `WGOGOL_METRIC_REGISTRY` names.

## Adding a new metric

1. Add the spec to `WGOGOL_METRIC_REGISTRY` in `metric-registry.ts` (name, kind, help, labelKeys, unit, buckets).
2. Add the typed ref to `METRIC_REFS` in `typed-refs.ts` with matching name and label keys as `as const`.
3. The compile-time assertion will fail if the keys don't match.
4. Update consumers to use `METRIC_REFS.<new_metric>`.
