---
id: RFC-0337
title: "Establish the observability port and closed telemetry conventions"
status: implemented
kind: architecture
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
  - DNA-1
  - DNA-19
  - RFC-0182
  - RFC-0203
  - RFC-0218
  - RFC-0255
  - RFC-0266
  - RFC-0282
  - RFC-0283
  - RFC-0284
  - RFC-0304
  - RFC-0338
  - RFC-0339
  - RFC-0340
  - RFC-0341
  - RFC-0342
  - RFC-0343
  - RFC-0344
satisfies:
  - DNA-1
  - DNA-19
commands:
  proposed: []
  added:
    - observability.conventions.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/observability"
  - "@gogol/site-kernel-observability"
  - "@gogol/site-kernel"
successSignals:
  - "Every telemetry signal emitted anywhere in the ecosystem (workers, factory, probes, pollers) carries the same closed resource-attribute vocabulary, so one SigNoz backend can aggregate the whole fleet and drill down to a single site."
  - "Metric names and label keys come from one typed registry in @gogol/observability; an unknown metric name or label key is a build-time validation error, not a silent cardinality leak."
  - "Any emitter becomes a no-op when WGOGOL_OTLP_ENDPOINT / WGOGOL_OTLP_TOKEN are absent; offline builds and local development never require the observability backend."
  - "PII redaction rules are stated once and enforced at the collector gateway, not re-invented per emitter."
nonGoals:
  - "Do not deploy the SigNoz backend itself (RFC-0338)."
  - "Do not wire any concrete emitter: workers traces (RFC-0339), factory metrics (RFC-0340), fleet probes (RFC-0341), delivery metrics (RFC-0343)."
  - "Do not define alert rules or notification channels (RFC-0342)."
  - "Do not add visitor/web analytics; Matomo (RFC-0170, RFC-0305) remains the only visitor-analytics lane and its events never flow into the observability backend."
  - "Do not adopt the @opentelemetry/* SDK family as a runtime dependency; the push helper is a minimal hand-rolled OTLP/HTTP JSON client."
acceptance:
  - probe: file-exists
    path: "packages/observability/src/index.ts"
  - probe: file-exists
    path: "packages/observability/src/conventions.ts"
  - probe: file-exists
    path: "packages/observability/src/metric-registry.ts"
  - probe: file-exists
    path: "packages/os/site-kernel-observability/package.json"
  - probe: command-registered
    name: "observability.conventions.validate"
  - probe: run
    command: "site-kernel run observability.conventions.validate --json"
    expect:
      exitCode: 0
---

# RFC-0337: Establish the observability port and closed telemetry conventions

## Context

The ecosystem is a fleet of static Astro sites (`output: "static"`, DNA-1) deployed as one Cloudflare Worker per site (RFC-0149), a set of backend compositions under `backs/*` (RFC-0304), integration workers under `integrations/*`, and a large build-time control plane ("the factory") of site-kernel commands (RFC-0266). Today none of these emit telemetry to a common backend. Workers logs stay in the Cloudflare dashboard, factory runs leave only per-run console output and pipeline budget metadata (RFC-0255), and there is no time-series history for anything: no uptime trend, no build-failure trend, no fleet-wide view.

The founder decided (2026-07-07) to adopt **self-hosted SigNoz on an EU VPS** as the single observability backend. A Perplexity research document proposed a prom-client `/metrics` pull architecture; that architecture was rejected because it assumes long-lived Node SSR processes, which this ecosystem does not have (static sites + ephemeral Worker isolates make pull scraping meaningless). The correct architecture for this fleet is **push-only OTLP**.

This RFC is the keystone of an eight-RFC series:

| RFC | Concern |
| --- | --- |
| **RFC-0337 (this)** | Observability port, closed telemetry conventions, `@gogol/observability` push library |
| RFC-0338 | Deploy the self-hosted SigNoz stack on an EU VPS (`backs/observability-stack`) |
| RFC-0339 | Export Cloudflare Workers traces to the backend (wrangler template + validator) |
| RFC-0340 | Emit factory telemetry from kernel command runs |
| RFC-0341 | Scheduled fleet probes pushing synthetic metrics (`backs/fleet-probe-runner`) |
| RFC-0342 | Alerts-as-code through kernel commands + SigNoz API (email + Telegram) |
| RFC-0343 | Poll Cloudflare analytics into delivery metrics (`backs/cf-analytics-poller`) |
| RFC-0344 | Read-only agent access to telemetry via the SigNoz MCP server |

## Problem

Without a single convention layer, each emitter added by RFC-0339..0343 would invent its own service names, label keys, and endpoint plumbing. Three specific invariants are unprotected:

1. **Identity.** Nothing guarantees that the same site is called the same thing in workers traces, probe metrics, and factory metrics. Fleet aggregation and per-site drill-down (the entire point of the backend) break if `service.name` drifts.
2. **Cardinality.** ClickHouse degrades when metric labels carry unbounded values (raw URLs, run ids, user ids). Nothing currently forbids that.
3. **Coupling.** If emitters hard-code SigNoz specifics, the backend cannot be swapped and offline builds could start depending on network reachability, violating the offline-deterministic factory principle (RFC-0266).

## Decision

Introduce an **observability port**: OTLP/HTTP is the only telemetry protocol in the ecosystem, the backend is reachable only through two environment variables, and all names come from one closed, typed vocabulary.

1. New runtime package **`packages/observability` (`@gogol/observability`)** — zero-dependency conventions + minimal OTLP/HTTP JSON push client, usable from Node backs, kernel commands, and Cloudflare Workers alike.
2. New kernel module package **`packages/os/site-kernel-observability` (`@gogol/site-kernel-observability`)** — hosts all `observability.*` and `fleet.probe.*` commands added by this series, registered into the kernel like `@gogol/site-kernel-check-webgogol`.
3. New workspace command **`observability.conventions.validate`** — offline lint that keeps every emitter inside the closed vocabulary.

### The environment contract (the port)

| Variable | Meaning |
| --- | --- |
| `WGOGOL_OTLP_ENDPOINT` | Base URL of the OTLP/HTTP ingest, e.g. `https://ingest.observe.webgogol.com`. Emitters append `/v1/metrics`, `/v1/traces`, `/v1/logs`. |
| `WGOGOL_OTLP_TOKEN` | Bearer token sent as `Authorization: Bearer <token>`. |

If **either** variable is absent or empty, every emitter built on `@gogol/observability` MUST become a silent no-op (`createMetricsPusher` returns `null`). No emitter may fail, warn repeatedly, retry, or block on the backend. This single rule keeps the factory offline-deterministic.

### Closed resource-attribute vocabulary

Every OTLP resource emitted anywhere MUST consist of exactly these attributes (no additions without amending this RFC):

| Attribute | Required | Values |
| --- | --- | --- |
| `service.name` | yes | The workspace directory name of the emitter: an app id (`webgogol-com`), a back id (`fleet-probe-runner`), an integration worker name, or the literal `site-kernel` for factory runs. |
| `service.version` | no | Git short SHA when known. |
| `deployment.environment` | yes | `production` \| `preview` \| `development` \| `ci` |
| `wgogol.layer` | yes | `site` \| `back` \| `factory` \| `probe` \| `delivery` |
| `wgogol.site_id` | conditional | The app workspace directory name (`webgogol-com`, `nicaragua-projekt`, `check-webgogol-com`) whenever the signal is about one specific site. Required on all `site`-, `probe`-, and `delivery`-layer signals; required on `factory` signals produced by app-scoped commands. |

Rule: for site workers, `service.name` and `wgogol.site_id` are identical. Cloudflare-originated traces that arrive without `wgogol.*` attributes are enriched at the collector gateway (RFC-0338/RFC-0339): `wgogol.site_id` is copied from `service.name`, `wgogol.layer` is set to `site`.

### Metric naming and label rules

- Metric names match `^wgogol_(factory|probe|delivery|workers)_[a-z0-9_]+$`, snake_case.
- Counters end in `_total`; durations end in `_seconds`; sizes end in `_bytes`; day counts end in `_days`.
- Every metric and its complete label-key set is declared in `metric-registry.ts` (see Design). Emitting an undeclared metric name or label key is a violation.
- **Forbidden as label values** (cardinality budget): raw URLs or paths with parameters, query strings, run/request/session/user identifiers, timestamps, email addresses. Route labels must come from a finite authored list (e.g. probe route templates), never from observed traffic.
- `site_id` is an allowed label (fleet size is bounded and slow-growing).

### PII and EU-residency policy

- Metrics and their labels MUST NOT contain PII. Ever.
- Traces MAY contain URLs; the collector gateway (RFC-0338) strips query strings and known-PII attribute keys before storage. Emitters SHOULD pre-redact with `redactUrl()` when convenient, but the gateway is the enforcement point.
- The backend stores all telemetry in the EU (RFC-0338). Telemetry from Cloudflare Workers originates wherever the isolate runs — this is the same accepted transit relaxation already applied to the integration hub (RFC-0179 decision trail) and is documented, not hidden.
- Visitor analytics (page views, campaigns, sessions) stay in Matomo (RFC-0170/RFC-0305). The observability backend receives operational signals only.

## Architectural fit

- **DNA-1 (monorepo boundary).** Reusable telemetry logic lives in `packages/observability`; command surfaces live in `packages/os/site-kernel-observability`; deployable compositions (stack, probe runner, pollers) live in `backs/*` per RFC-0304. No app grows observability code.
- **DNA-19 (closed ontology vocabularies).** The attribute vocabulary, layer enum, and metric registry are closed sets in typed modules — the same governance style as archetype and section ontologies.
- **RFC-0203 (canonical Diagnostic).** `observability.conventions.validate` emits canonical diagnostics with rule ids.
- **RFC-0255 (pipeline timing metadata).** Factory duration metrics (RFC-0340) complement — not replace — the static budget metadata; both use the same command names.
- **RFC-0266 (command manifest).** All new commands declare reads/writes and register in the manifest.
- **RFC-0282/0283/0284.** The visibility feedback loop, circuit breaker, and fleet Leitstand gain a real time-series substrate; they consume, this series produces.
- **RFC-0218 (agent operating model).** Extended by RFC-0344 with a telemetry-read lane.

## Design

### Package `packages/observability` (`@gogol/observability`)

Private, `type: module`, **zero runtime dependencies**, Workers-compatible (no `node:` imports in the core modules; the pusher uses global `fetch`).

```text
packages/observability/
  package.json
  turbo.json
  src/
    index.ts            # barrel
    conventions.ts      # closed vocabularies + resource builder
    metric-registry.ts  # closed metric catalog
    otlp-json.ts        # OTLP/HTTP JSON envelope encoding
    pusher.ts           # createMetricsPusher
    redact.ts           # redactUrl and PII helpers
```

#### `conventions.ts`

```ts
export type WgogolLayer = "site" | "back" | "factory" | "probe" | "delivery";
export type WgogolEnvironment = "production" | "preview" | "development" | "ci";

export interface WgogolResourceInput {
  serviceName: string;          // workspace dir name or "site-kernel"
  layer: WgogolLayer;
  environment: WgogolEnvironment;
  siteId?: string;              // required per vocabulary table
  serviceVersion?: string;      // git short sha
}

/** Validates input against the closed vocabulary and returns OTLP resource attributes. Throws on violations. */
export function buildResourceAttributes(input: WgogolResourceInput): OtlpKeyValue[];

export const OTLP_ENDPOINT_ENV = "WGOGOL_OTLP_ENDPOINT";
export const OTLP_TOKEN_ENV = "WGOGOL_OTLP_TOKEN";
```

#### `metric-registry.ts`

```ts
export type WgogolMetricKind = "counter" | "gauge" | "histogram";

export interface WgogolMetricSpec {
  name: string;                  // ^wgogol_(factory|probe|delivery|workers)_[a-z0-9_]+$
  kind: WgogolMetricKind;
  help: string;
  labelKeys: readonly string[];  // closed set for this metric
  unit?: string;                 // "s" | "By" | "1" | "d"
  buckets?: readonly number[];   // histograms only
}

/** The single closed catalog. RFC-0340/0341/0343 add entries here via their implementations. */
export const WGOGOL_METRIC_REGISTRY: readonly WgogolMetricSpec[];

export function findMetricSpec(name: string): WgogolMetricSpec | undefined;
```

The registry ships in this RFC with an empty (or fixture-only) list plus one smoke metric `wgogol_factory_smoke_total` (labels: none) used by `observability.factory.smoke` (RFC-0340). Later RFCs append entries in the same file; the file stays the single source.

#### `pusher.ts`

```ts
export interface MetricsPusherEnv {
  endpoint?: string; // WGOGOL_OTLP_ENDPOINT
  token?: string;    // WGOGOL_OTLP_TOKEN
}

export interface MetricsPusher {
  counterAdd(name: string, value: number, labels?: Record<string, string>): void;
  gaugeSet(name: string, value: number, labels?: Record<string, string>): void;
  histogramRecord(name: string, value: number, labels?: Record<string, string>): void;
  /** Encodes accumulated points as one OTLP/HTTP JSON POST to {endpoint}/v1/metrics.
   *  Resolves within timeoutMs (default 2000). Never throws; returns delivery status. */
  flush(): Promise<{ delivered: boolean; reason?: string }>;
}

/** Returns null when endpoint or token is missing — callers skip telemetry entirely. */
export function createMetricsPusher(
  resource: WgogolResourceInput,
  env?: MetricsPusherEnv,        // defaults to process.env when available
  options?: { timeoutMs?: number },
): MetricsPusher | null;
```

Behavioral contract (binding):

- Every `name`/`labels` pair is validated against `WGOGOL_METRIC_REGISTRY` (unknown name, unknown label key, or forbidden label value pattern → throw in `development`/`ci`, drop-and-count in `production`).
- `flush()` sends **delta temporality** sums and histograms (`aggregationTemporality: 1`) and plain gauges, because emitters are short-lived processes; SigNoz is OTLP-native and accepts delta.
- One `flush()` = at most one HTTP request. No retries. Timeout aborts via `AbortController`. All failures are swallowed into `{ delivered: false, reason }`.

#### `otlp-json.ts` — exact wire format (so no agent has to guess)

`POST {endpoint}/v1/metrics`, headers `Content-Type: application/json`, `Authorization: Bearer {token}`. Body:

```json
{
  "resourceMetrics": [{
    "resource": { "attributes": [
      { "key": "service.name", "value": { "stringValue": "fleet-probe-runner" } },
      { "key": "deployment.environment", "value": { "stringValue": "production" } },
      { "key": "wgogol.layer", "value": { "stringValue": "probe" } },
      { "key": "wgogol.site_id", "value": { "stringValue": "webgogol-com" } }
    ]},
    "scopeMetrics": [{
      "scope": { "name": "@gogol/observability", "version": "1" },
      "metrics": [
        { "name": "wgogol_probe_up", "gauge": { "dataPoints": [
          { "asDouble": 1, "timeUnixNano": "1751884800000000000",
            "attributes": [ { "key": "site_id", "value": { "stringValue": "webgogol-com" } } ] }
        ] } },
        { "name": "wgogol_probe_http_status_class_total", "unit": "1", "sum": {
          "aggregationTemporality": 1, "isMonotonic": true, "dataPoints": [
            { "asDouble": 3, "startTimeUnixNano": "1751884500000000000",
              "timeUnixNano": "1751884800000000000",
              "attributes": [ { "key": "status_class", "value": { "stringValue": "2xx" } } ] }
        ] } },
        { "name": "wgogol_factory_command_duration_seconds", "unit": "s", "histogram": {
          "aggregationTemporality": 1, "dataPoints": [
            { "startTimeUnixNano": "1751884500000000000", "timeUnixNano": "1751884800000000000",
              "count": "3", "sum": 42.5,
              "bucketCounts": ["0","1","1","1","0","0","0","0","0","0","0"],
              "explicitBounds": [0.5,1,2,5,10,30,60,120,300,600] }
        ] } }
      ]
    }]
  }]
}
```

Timestamps are unix-nano **strings**. `bucketCounts` has `explicitBounds.length + 1` entries. This is the OTLP 1.x JSON encoding; unit tests must fixture-pin it.

#### `redact.ts`

```ts
/** Strips query string and fragment; lowercases host. "https://a.b/p?q=1#f" → "https://a.b/p" */
export function redactUrl(url: string): string;
```

### Command `observability.conventions.validate`

Scope: workspace, read-only, offline. Registered in `PACKAGES_CHECK_PIPELINE`.

| Rule | Severity | Meaning |
| --- | --- | --- |
| `OBS-CONV-01` | error | A string literal matching `^wgogol_[a-z0-9_]+$` used with a pusher call in `packages/**`, `backs/**`, or `integrations/**` is not declared in `WGOGOL_METRIC_REGISTRY`. |
| `OBS-CONV-02` | error | A registry entry violates the naming grammar (prefix, snake_case, unit suffix). |
| `OBS-CONV-03` | error | A registry entry declares a forbidden label key (`user_id`, `session_id`, `request_id`, `run_id`, `url`, `path`, `email`). |
| `OBS-CONV-04` | warning | Direct use of `WGOGOL_OTLP_ENDPOINT`/`WGOGOL_OTLP_TOKEN` env reads outside `@gogol/observability` (emitters must go through the port). |
| `OBS-CONV-05` | error | Duplicate metric name in the registry. |

Output uses the canonical Diagnostic envelope (RFC-0203), `--json` supported.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/observability/src/*` | New package (this RFC). |
| `packages/os/site-kernel-observability/*` | New kernel command module; this RFC creates the package skeleton, module registration, and `observability.conventions.validate`. |
| `docs/command-manifest.generated.json` | Regenerated to include the new command. |

## Rollout

1. Create `packages/observability` with `conventions.ts`, `metric-registry.ts` (smoke entry only), `otlp-json.ts`, `pusher.ts`, `redact.ts`; unit-test the OTLP envelope against the fixture above, the no-op-when-env-absent rule, and registry validation.
2. Create `packages/os/site-kernel-observability`, register the module into the kernel command registry (mirror `@gogol/site-kernel-check-webgogol` registration), implement `observability.conventions.validate` with fixture tests per rule.
3. Wire the command into `PACKAGES_CHECK_PIPELINE`; regenerate the command manifest; run `gitattributes.generate` if any generated outputs were added (RFC-0336).
4. Later RFCs in the series append registry entries and consume the pusher; no flag day.

## Alternatives considered

- **prom-client `/metrics` pull endpoints (the research document's core proposal).** Rejected: static sites have nothing to scrape; Worker isolates are ephemeral and many, so a scrape hits one random isolate with a fresh registry.
- **Adopt `@opentelemetry/sdk-node` + auto-instrumentations.** Rejected for the port: heavy dependency tree, Node-only, and its long-lived-process assumptions do not fit short-lived kernel commands or Workers. A hand-rolled OTLP JSON client is ~200 lines and fixture-testable.
- **Put helpers in `@gogol/share`.** Rejected: share is already broad; the observability port deserves an owned, closed surface with its own validator.
- **Vendor-neutral abstraction over multiple backends.** Rejected as premature; the port is two env vars + OTLP, which is already backend-swappable by construction.

## Risks

- **Registry becomes a bottleneck.** Every new metric needs a registry entry. Accepted deliberately — that friction is the cardinality control.
- **Hand-rolled OTLP drifts from the spec.** Mitigated by fixture-pinned unit tests and by `observability.stack.health` (RFC-0338) which round-trips a real metric into SigNoz.
- **Silent no-op hides misconfiguration.** Mitigated: `flush()` returns delivery status, `observability.factory.smoke` (RFC-0340) and `observability.stack.health` (RFC-0338) exist precisely to verify the pipe on demand.
- **Grep-based OBS-CONV-01 misses dynamic names.** Accepted: constructing metric names dynamically is itself forbidden by this RFC; the lint plus registry validation in the pusher cover both ends.

## Acceptance criteria

- [x] `@gogol/observability` exists with the five modules, zero runtime dependencies, and Workers-compatible core (no `node:` imports in `conventions/otlp-json/pusher/redact`). (evidence: packages/ directory, package exists)
- [x] OTLP JSON envelope fixture-tested (gauge, delta sum, delta histogram; unix-nano string timestamps). (evidence: implemented historically)
- [x] `createMetricsPusher` returns `null` without both env vars; `flush()` never throws and honors the 2s timeout. (evidence: implemented historically)
- [x] `WGOGOL_METRIC_REGISTRY` validation enforced in the pusher (unknown name/label → throw in dev/ci, drop in production). (evidence: implemented historically)
- [x] `@gogol/site-kernel-observability` package registered; `observability.conventions.validate` implemented with OBS-CONV-01..05 fixture tests and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: packages/ directory, package exists)
- [x] Command manifest regenerated; `command.manifest.validate` passes. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`). Agents MAY transition `accepted` → `implemented` per RFC-0224; run `site-kernel run rfc.verification.emit --id RFC-0337` and commit the evidence in the same commit (RFC-0330).
- Do NOT add `@opentelemetry/*` packages as runtime dependencies of `@gogol/observability`.
- Do NOT emit any metric name or label key that is not in `WGOGOL_METRIC_REGISTRY`; extend the registry in the RFC that introduces the emitter.
- Do NOT read `WGOGOL_OTLP_*` env vars outside `@gogol/observability`.
- Keep the core modules free of `node:` imports so Cloudflare Workers can import them.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0337 --reason "..." --invariant "DNA-19"` (RFC-0334) instead of working around it.
