---
id: RFC-0807
title: "Connect all services to SigNoz via OTLP push for health monitoring"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-11
updatedAt: 2026-08-11
enhancedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0337
  - RFC-0346
amendedBy: []
related:
  - DNA-40
  - RFC-0337
  - RFC-0340
  - RFC-0341
  - RFC-0343
  - RFC-0806
satisfies:
  - DNA-40
versionBump: minor
commands:
  proposed:
    - service.otlp.validate
  added:
    - service.otlp.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
nonGoals:
  - "Do not replace Cloudflare Workers built-in traces/logs — this adds custom metrics push alongside it."
  - "Do not implement a PULL-based health probe system — PUSH via OTLP is the chosen strategy."
  - "Do not implement alerting rules or dashboards in SigNoz — separate operational concern."
  - "Do not add OTLP push to observability-stack itself — circular dependency."
  - "Do not implement leitstand.service.health-poll — health is derived from pushed metrics in SigNoz."
successSignals:
  - "Every CF Worker service pushes custom OTLP health metrics to SigNoz via createMetricsPusher."
  - "check-runner pushes OTLP health metrics (queue depth, run count, errors) to SigNoz."
  - "All services have WARPGOGOL_OTLP_ENDPOINT and WARPGOGOL_OTLP_TOKEN in .env.example."
  - "New metrics in WARPGOGOL_METRIC_REGISTRY with back prefix."
  - "METRIC_NAME_PATTERN updated to include back prefix."
  - "service.otlp.validate checks OTLP env vars in every service."
  - "warpgogol_back_up metric visible in SigNoz UI for at least rate-fetcher (verifiable via SigNoz metric explorer query)."
---

# RFC-0807: Connect all services to SigNoz via OTLP push for health monitoring

## Context

The Werkstatt operates a dedicated SigNoz server (`services/observability-stack`) with Caddy providing public OTLP ingest at `https://ingest.observe.warpgogol.com` (bearer-token auth) and internal ingest at `http://otel-collector:4318` for co-located Docker services.

Two Node services already push metrics via `createMetricsPusher` from `@warpgogol/werkstatt-site/observability`:

- `fleet-probe-runner` (layer: `probe`, internal endpoint)
- `cf-analytics-poller` (layer: `delivery`, internal endpoint)

Five CF Worker services and `check-runner` do NOT push custom metrics. Workers already send traces/logs via wrangler `destinations: ["signoz"]`, but no custom health/operation metrics.

Exploration note: `docs/explorations/service-health-contour.md`.

### Why PUSH, not PULL

**PULL (external poller hitting `/health`) rejected:**

1. Requires a new always-on prober — itself needs monitoring (circular dependency).
2. Point-in-time snapshots — transient failures between polls are invisible.
3. No functional depth — `/health` returns `{"status":"ok"}`, cannot see "processed 5 sources, 3 OK, 2 failed" without functional probes (more work than pushing metrics).
4. Does not work for Node services without HTTP (`check-runner`) — needs parallel mechanism (heartbeat files, PID checks).
5. No history — poll state is "last check" or requires a new state store.

**PUSH (OTLP metrics) chosen:**

1. SigNoz is already running — ingest pipeline operational.
2. `createMetricsPusher` already exists, tested, Workers-compatible, zero-dependency.
3. Works for all service kinds — Workers (via `env`), Node loops (via `process.env`), queue consumers.
4. Real-time — metrics pushed as events happen.
5. Rich health indicators — each service knows its own state better than an external poller.
6. Free dashboards and alerting — SigNoz provides time-series storage, dashboards, alerting.
7. No new infrastructure — no prober service, no probe declarations, no state file.

## Problem

Five Worker services and `check-runner` are invisible in SigNoz custom metrics. The operator cannot see service health dashboards, set up alerts, or track operational metrics over time.

## Decision

All `services/*` except `observability-stack` push custom OTLP health metrics to SigNoz via `createMetricsPusher`.

### Metric registry extension

New metrics in `WARPGOGOL_METRIC_REGISTRY` with `back` prefix:

| Metric | Kind | Labels | Help |
| --- | --- | --- | --- |
| `warpgogol_back_requests_total` | counter | `service`, `status_class` | Total HTTP requests served |
| `warpgogol_back_up` | gauge | `service` | 1 = healthy, 0 = unhealthy |
| `warpgogol_back_last_run_total` | counter | `service`, `status` | Scheduled runs by outcome |
| `warpgogol_back_last_error_total` | counter | `service` | Total errors |
| `warpgogol_back_queue_depth` | gauge | `service` | Current queue depth |

`METRIC_NAME_PATTERN` updated to `warpgogol_(factory|probe|delivery|workers|back)_[a-z0-9_]+`.

`WarpgogolLayer` already includes `"back"` — no change to `conventions.ts`.

### Per-service integration

**CF Worker services** (matomo-proxy, rate-fetcher, lagebild-sync, telegram-alert-bridge, maturity-score):

1. Add `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` to `Env` interface.
2. Call `createMetricsPusher({ serviceName: "<id>", layer: "back", environment: "production" }, { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN })`.
3. Push `requests_total`, `up`, `last_error_total` in request/scheduled handlers.
4. Update `.env.example` and `.env.dev.example`.

Per-service focus:

| Service                 | Key metrics                                    |
| ----------------------- | ---------------------------------------------- |
| `matomo-proxy`          | `requests_total`, `up` (upstream reachability) |
| `rate-fetcher`          | `last_run_total`, `last_error_total`, `up`     |
| `lagebild-sync`         | `last_run_total`, `last_error_total`, `up`     |
| `telegram-alert-bridge` | `requests_total`, `last_error_total`, `up`     |
| `maturity-score`        | `requests_total`, `up`                         |

**Node services:**

`check-runner` gains `WARPGOGOL_OTLP_ENDPOINT` / `WARPGOGOL_OTLP_TOKEN` in `.env.example`, `createMetricsPusher` call, and pushes `queue_depth`, `last_run_total`, `last_error_total`.

`fleet-probe-runner` and `cf-analytics-poller` — no changes, already connected.

### Endpoint configuration

| Runtime | Endpoint | Token |
| --- | --- | --- |
| CF Worker (edge) | `https://ingest.observe.warpgogol.com` | `WARPGOGOL_OTLP_TOKEN` (Caddy bearer) |
| Node (Docker compose) | `http://otel-collector:4318` | not needed (internal) |
| Node (local dev) | `https://ingest.observe.warpgogol.com` | `WARPGOGOL_OTLP_TOKEN` |

### Validator

`service.otlp.validate` checks every `services/*` (except `observability-stack`):

1. `WARPGOGOL_OTLP_ENDPOINT` in `.env.example` with `# How to obtain:`.
2. `WARPGOGOL_OTLP_TOKEN` in `.env.example` with `# How to obtain:`.
3. For CF Worker services: both vars in `Env` interface (source grep).

**CLI surface:**

```sh
pnpm exec werkstatt run service.otlp.validate
```

Workspace-scope command, no flags. Scans `services/*` (except `observability-stack`) automatically.

**Output format (`--json`):**

```json
{
  "command": "service.otlp.validate",
  "status": "pass|fail",
  "diagnostics": [
    {
      "ruleId": "OTLP-01|OTLP-02|OTLP-03",
      "severity": "error",
      "file": "services/<id>/.env.example",
      "message": "...",
      "fixHint": "..."
    }
  ]
}
```

**Failure modes:**

| Rule | Severity | Condition |
| --- | --- | --- |
| OTLP-01 | error | `WARPGOGOL_OTLP_ENDPOINT` missing from `.env.example` or missing `# How to obtain:` |
| OTLP-02 | error | `WARPGOGOL_OTLP_TOKEN` missing from `.env.example` or missing `# How to obtain:` |
| OTLP-03 | error | CF Worker service: `WARPGOGOL_OTLP_ENDPOINT` or `WARPGOGOL_OTLP_TOKEN` not in `Env` interface |

Exit code 1 on any error. Blocking in `services.check.run` pipeline (same as `env.contract.validate`).

**Why a new command instead of extending `env.contract.validate`:** `env.contract.validate` checks documentation format (every var has `# How to obtain:`) but does not check for the presence of specific required env vars, and does not grep Worker source code for `Env` interface declarations. `service.otlp.validate` combines .env.example presence checks with source-level `Env` interface verification — the source grep is unique to this validator and outside the scope of `env.contract.validate`.

## Architectural fit

- **DNA-40** — new env vars (`WARPGOGOL_OTLP_ENDPOINT`, `WARPGOGOL_OTLP_TOKEN`) follow the existing `.env.example` contract with `# How to obtain:` lines.
- **RFC-0337** — extends the observability port with new metrics in the closed registry. The metric name pattern is amended to include `back` prefix.
- **RFC-0806** — complements the service deploy pipeline. Post-deploy health is now visible in SigNoz instead of a one-shot `runHealthCheck` call.
- **RFC-0340/0341/0343** — follows the same `createMetricsPusher` pattern established by factory command metrics, fleet probe metrics, and CF analytics delivery metrics.

## Design

### Metric registry

New metrics added to `WARPGOGOL_METRIC_REGISTRY` in `@/packages/werkstatt-site/src/domain/observability/metric-registry.ts`:

```ts
{
  name: "warpgogol_back_requests_total",
  kind: "counter",
  help: "Total HTTP requests served by backend services.",
  labelKeys: ["service", "status_class"],
  unit: "1",
},
{
  name: "warpgogol_back_up",
  kind: "gauge",
  help: "1 = service self-reports healthy; 0 = unhealthy.",
  labelKeys: ["service"],
  unit: "1",
},
{
  name: "warpgogol_back_last_run_total",
  kind: "counter",
  help: "Total scheduled runs by outcome (success/failure).",
  labelKeys: ["service", "status"],
  unit: "1",
},
{
  name: "warpgogol_back_last_error_total",
  kind: "counter",
  help: "Total errors encountered by the service.",
  labelKeys: ["service"],
  unit: "1",
},
{
  name: "warpgogol_back_queue_depth",
  kind: "gauge",
  help: "Current queue depth (items pending processing).",
  labelKeys: ["service"],
  unit: "1",
},
```

Pattern update:

```ts
export const METRIC_NAME_PATTERN = /^warpgogol_(factory|probe|delivery|workers|back)_[a-z0-9_]+$/;
```

### Worker service integration

```ts
interface WorkerEnv {
  // ... existing vars ...
  WARPGOGOL_OTLP_ENDPOINT: string;
  WARPGOGOL_OTLP_TOKEN: string;
}

// In fetch/scheduled handler:
const pusher = createMetricsPusher(
  { serviceName: "rate-fetcher", layer: "back", environment: "production" },
  { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
);
if (pusher) {
  pusher.gaugeSet("warpgogol_back_up", 1, { service: "rate-fetcher" });
  pusher.counterAdd("warpgogol_back_last_run_total", 1, { service: "rate-fetcher", status: "success" });
  await pusher.flush();
}
```

**`createMetricsPusher` null behavior:** When `WARPGOGOL_OTLP_ENDPOINT` or `WARPGOGOL_OTLP_TOKEN` is not set (e.g. local dev without SigNoz), `createMetricsPusher` returns `null`. The `if (pusher)` guard ensures metrics are silently skipped — no errors, no network calls. This is by design: local development does not require a running SigNoz instance.

### Services without `.env.example`

`matomo-proxy` and `maturity-score` currently do not have `.env.example` files because they do not consume environment variables. Adding OTLP push means they now consume `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` — per DNA-40, they must have `.env.example` created with these two vars and `# How to obtain:` lines.

### `typed-refs.ts` update

The compile-time assertion in `typed-refs.ts` (line 121) requires every `METRIC_REFS` key to match a `WARPGOGOL_METRIC_REGISTRY` name. Adding new `back` metrics to the registry without adding them to `METRIC_REFS` will cause a compile error. The new metrics must be added to `METRIC_REFS` in the same commit:

```ts
warpgogol_back_requests_total: defineCounter("warpgogol_back_requests_total", ["service", "status_class"] as const),
warpgogol_back_up: defineGauge("warpgogol_back_up", ["service"] as const),
warpgogol_back_last_run_total: defineCounter("warpgogol_back_last_run_total", ["service", "status"] as const),
warpgogol_back_last_error_total: defineCounter("warpgogol_back_last_error_total", ["service"] as const),
warpgogol_back_queue_depth: defineGauge("warpgogol_back_queue_depth", ["service"] as const),
```

## File system responsibilities

| Path | Change |
| --- | --- |
| `packages/werkstatt-site/src/domain/observability/metric-registry.ts` | Add 5 `back` metrics, update `METRIC_NAME_PATTERN` |
| `packages/werkstatt-site/src/domain/observability/typed-refs.ts` | Add 5 `back` entries to `METRIC_REFS` |
| `packages/werkstatt-site/src/checks/check-warpgogol/commands/` | New `service-otlp-validate.ts` handler |
| `packages/werkstatt-site/src/checks/command-tables/` | Register `service.otlp.validate` command |
| `packages/werkstatt-site/src/checks/check-warpgogol/commands/services-check.ts` | Add `service.otlp.validate` to `services.check.run` pipeline |
| `services/matomo-proxy/.env.example` | Create with OTLP env vars |
| `services/maturity-score/.env.example` | Create with OTLP env vars |
| `services/rate-fetcher/.env.example` | Add OTLP env vars |
| `services/rate-fetcher/.env.dev.example` | Add OTLP env vars |
| `services/lagebild-sync/.env.example` | Add OTLP env vars |
| `services/lagebild-sync/.env.dev.example` | Add OTLP env vars |
| `services/telegram-alert-bridge/.env.example` | Add OTLP env vars |
| `services/telegram-alert-bridge/.env.dev.example` | Add OTLP env vars |
| `services/check-runner/.env.example` | Add OTLP env vars |
| `services/matomo-proxy/src/index.ts` | Add `createMetricsPusher` call |
| `services/rate-fetcher/src/index.ts` | Add `createMetricsPusher` call |
| `services/lagebild-sync/src/index.ts` | Add `createMetricsPusher` call |
| `services/telegram-alert-bridge/src/index.ts` | Add `createMetricsPusher` call |
| `services/maturity-score/src/index.ts` | Add `createMetricsPusher` call |
| `services/check-runner/src/worker.ts` | Add `createMetricsPusher` call |
| `services/AGENTS.md` | Document OTLP env var requirement |
| `docs/architecture-dna.md` | Amend DNA-40 to mention OTLP env vars |

## Rollout

1. **Metric registry** — add `back` metrics to `WARPGOGOL_METRIC_REGISTRY` and `METRIC_REFS` + update `METRIC_NAME_PATTERN`.
2. **Pilot: `rate-fetcher`** — already has Supabase health table, easiest to validate end-to-end.
3. **Remaining Workers** — matomo-proxy, lagebild-sync, telegram-alert-bridge, maturity-score. Create `.env.example` for matomo-proxy and maturity-score (they don't have one today).
4. **`check-runner`** — Node integration.
5. **`service.otlp.validate`** — register command, add to `services.check.run` pipeline as blocking (error).
6. **DNA-40 update** — amend `docs/architecture-dna.md` DNA-40 entry to mention OTLP env vars. Add RFC-0807 to `amendedBy` of RFC-0346 and RFC-0337.
7. **`services/AGENTS.md`** — document OTLP env var requirement in the env-and-deploy contract section.
8. **Compass sync** — update `docs/technology.xml` if the observability port contract is documented there.

**Future service compliance:** Any new service added to `services/*` (except `observability-stack`) must include `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` in its `.env.example` and (for Workers) in its `Env` interface. `service.otlp.validate` enforces this automatically — no additional registration needed.

## Alternatives considered

- **PULL-based health probes** (`leitstand.service.health` polling `/health`) — rejected (see Why PUSH above).
- **Hybrid (PULL for Workers + PUSH for Node)** — rejected, adds two mechanisms for no benefit.
- **Cloudflare Workers built-in observability only** — rejected, traces/logs are useful but don't provide custom health gauges/counters for dashboards and alerting.

## Risks

- **SigNoz downtime = blind spot** — if SigNoz is down, metrics are lost (fire-and-forget, no retry). Mitigation: Workers built-in traces/logs still work independently.
- **Token leakage** — `WARPGOGOL_OTLP_TOKEN` is a secret. Mitigation: Workers read from `env` bindings (set via `wrangler secret put`), Node reads from `.env` (gitignored).
- **Metric cardinality** — `service` label is low-cardinality (fixed set). `status_class` is 5 values. No high-cardinality labels.

## Acceptance criteria

- [ ] New `back` metrics declared in `WARPGOGOL_METRIC_REGISTRY`
- [ ] `METRIC_NAME_PATTERN` includes `back` prefix
- [ ] `rate-fetcher` pushes metrics to SigNoz (pilot)
- [ ] All 5 Worker services push metrics to SigNoz
- [ ] `check-runner` pushes metrics to SigNoz
- [ ] All services have `WARPGOGOL_OTLP_ENDPOINT` / `WARPGOGOL_OTLP_TOKEN` in `.env.example`
- [ ] `service.otlp.validate` registered and passing (verifiable via `werkstatt run service.otlp.validate`)
- [ ] `rfc.validate` passes

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition from `accepted` to `implemented` per RFC-0224 preconditions.
- Agents MUST NOT weaken metric registry validation rules without a superseding RFC.
