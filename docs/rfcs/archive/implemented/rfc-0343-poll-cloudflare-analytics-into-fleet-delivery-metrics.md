---
id: RFC-0343
title: "Poll Cloudflare analytics into fleet delivery metrics"
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
amendedBy:
  - RFC-0365
related:
  - RFC-0170
  - RFC-0304
  - RFC-0305
  - RFC-0337
  - RFC-0338
  - RFC-0339
  - RFC-0341
commands:
  proposed: []
  added:
    - observability.delivery.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
  - check-webgogol-com
packagesImpacted:
  - "@gogol/observability"
  - "@gogol/site-kernel-observability"
successSignals:
  - "Static-asset delivery — the traffic that never invokes a Worker and therefore never traces (RFC-0339) — is visible in SigNoz as per-site request, cache-ratio, and error-class time series."
  - "Worker invocation and error counts per site come from Cloudflare's authoritative counters, cross-checkable against trace volumes."
  - "The poller is aggregate-only: no IPs, no user agents, no per-visitor data ever enters the observability backend; Matomo remains the sole visitor-analytics system."
nonGoals:
  - "Do not ingest per-request logs (Logpush); aggregated GraphQL analytics only."
  - "Do not replace or duplicate Matomo (RFC-0170/0305); no visitor-level or campaign dimensions are polled."
  - "Do not poll Core Web Vitals / RUM in v1."
  - "Do not auto-discover zones via the Cloudflare API; the zone map is authored and validated."
acceptance:
  - probe: file-exists
    path: "backs/cf-analytics-poller/back.config.json"
  - probe: file-exists
    path: "backs/cf-analytics-poller/zones.jsonc"
  - probe: file-exists
    path: "backs/cf-analytics-poller/src/loop.ts"
  - probe: command-registered
    name: "observability.delivery.validate"
  - probe: run
    command: "site-kernel run observability.delivery.validate --json"
    expect:
      exitCode: 0
---

# RFC-0343: Poll Cloudflare analytics into fleet delivery metrics

## Context

RFC-0339 exports Worker traces, but requests served directly from the ASSETS binding never invoke the Worker — for a static fleet that is the overwhelming majority of traffic, and it is invisible to the observability backend. Cloudflare already aggregates this delivery data (zone HTTP request groups and Workers invocation groups) and exposes it through its GraphQL Analytics API with a read-only token. Polling those aggregates and re-emitting them as `wgogol_delivery_*` / `wgogol_workers_*` metrics closes the last signal gap in the series: SigNoz then holds runtime traces (0339), factory history (0340), outside-in probes (0341), and delivery volumes (this RFC) side by side per `site_id`.

The observability stack VPS (RFC-0338) already hosts co-located scheduled services via `compose.extra.yaml` (RFC-0341's runner); this poller is the second such service.

## Problem

1. "Is the site serving traffic, from cache, without 5xx?" cannot be answered from any signal the series has so far — probes sample a handful of routes, traces cover only API routes.
2. Cloudflare's dashboard holds the data but outside the unified backend: no fleet aggregation, no alerting, no correlation with probe/factory series, and bounded history.
3. Ad-hoc Cloudflare API usage without governance would tempt per-visitor data ingestion, colliding with the Matomo boundary and GDPR posture.

## Decision

Create **`backs/cf-analytics-poller`** (kind `scheduled-worker`, Node), co-located on the observability VPS, which every 5 minutes queries the Cloudflare GraphQL Analytics API for the **settled** window `[now-10m, now-5m)` and pushes delta metrics through the RFC-0337 port. Zone identity comes from an **authored** `zones.jsonc`, validated by a new offline command `observability.delivery.validate`.

### Authored zone map (`zones.jsonc`)

```jsonc
[
  {
    "siteId": "webgogol-com",          // must equal an apps/* workspace dir name
    "zoneId": "<cloudflare zone id>",  // from the CF dashboard, not a secret
    "workerScripts": ["webgogol-com"]  // wrangler `name`s attributed to this site
  }
]
```

### Metric registry additions (`@gogol/observability`)

| Name | Kind | Labels | Source |
| --- | --- | --- | --- |
| `wgogol_delivery_requests_total` | counter (delta) | `site_id`, `cache_status` (`hit` \| `miss` \| `dynamic` \| `other`), `status_class` (`2xx`..`5xx`) | zone httpRequests adaptive groups |
| `wgogol_delivery_bytes_total` | counter (delta) | `site_id` | same |
| `wgogol_workers_requests_total` | counter (delta) | `site_id` | workers invocations adaptive groups |
| `wgogol_workers_errors_total` | counter (delta) | `site_id` | same |

Resource: `service.name: "cf-analytics-poller"`, `wgogol.layer: "delivery"`, `wgogol.site_id` per zone, `deployment.environment: "production"`. Dimensions are capped to the closed label sets above — the GraphQL queries request **only** these dimensions, structurally excluding visitor-level data.

### Poller behavior (binding)

- Env: `CF_ANALYTICS_API_TOKEN` (Cloudflare token scoped to Analytics:Read on the studio account's zones + account), plus the RFC-0337 port vars. Missing any → log one line, idle (no crash-loop).
- Window watermark persisted to a small state file on the service's volume (`/data/watermark.json`) so restarts neither skip nor double-push a window; delta counters use the window bounds as `startTimeUnixNano`/`timeUnixNano`.
- One GraphQL request per zone per cycle (batched fields), one pusher flush per cycle; API errors → skip cycle, count internally, never crash.
- Rate discipline: with 3 zones this is ~36 requests/hour — far under Cloudflare's GraphQL limits; concurrency 1.

### Command `observability.delivery.validate` — workspace, read-only, offline; in `PACKAGES_CHECK_PIPELINE`

| Rule | Severity | Meaning |
| --- | --- | --- |
| `OBS-DLV-01` | error | `zones.jsonc` schema violation (missing/duplicate `siteId`, empty `zoneId`). |
| `OBS-DLV-02` | error | A `siteId` does not correspond to an `apps/*` workspace directory. |
| `OBS-DLV-03` | error | Poller boundary violation (`backs/cf-analytics-poller` imports from `apps/*`) or GraphQL query text requests a dimension outside the allowed set (`cacheStatus`, `edgeResponseStatus`, script name, counts/bytes). |
| `OBS-DLV-04` | warning | An `apps/*` workspace has no zone entry (new site not yet mapped). |

### Workspace layout

```text
backs/cf-analytics-poller/
  package.json              # private; dev/run:once/build:check per RFC-0304
  back.config.json          # kind: "scheduled-worker", entry: "src/loop.ts"
  turbo.json
  Dockerfile                # node:22-slim
  zones.jsonc               # authored zone map
  src/
    config.ts               # env parsing
    queries.ts              # the exact GraphQL documents (single module, OBS-DLV-03 lints it)
    poll.ts                 # pure: (zoneRow, graphqlResponse) → metric points; unit-testable
    watermark.ts            # window state persistence
    loop.ts                 # scheduler + pusher flush per cycle
    run-once.ts
  README.md
```

Deployment: service entry in `backs/observability-stack/compose.extra.yaml`, `WGOGOL_OTLP_ENDPOINT=http://otel-collector:4318`, a named volume for `/data`, `restart: unless-stopped`. `CF_ANALYTICS_API_TOKEN` joins the stack's `.env.example` (RFC-0338).

## Architectural fit

- **RFC-0304 / DNA-1.** Deployable composition in `backs/*`; pure transformation logic unit-tested in place, promoted to packages only if a second consumer appears.
- **RFC-0337.** Registry-declared metrics, delta temporality (native fit: each poll window is a delta), port-gated env, closed label sets as the cardinality control.
- **RFC-0170/0305 (Matomo boundary).** Enforced structurally: the GraphQL documents cannot return visitor-level rows given the validated dimension set; this RFC restates that the observability backend never receives visitor analytics.
- **RFC-0339.** Complementary: traces show _why_ an API request behaved; these counters show _how much_ of everything was served, including the Worker-bypassing static majority.
- **RFC-0341.** Probes say "reachable and correct from outside"; delivery metrics say "serving real traffic without error spikes" — RFC-0342 may later add an error-ratio alert on `wgogol_delivery_requests_total{status_class="5xx"}` via its normal source-edit lane.

## Design

(Fully specified above. `poll.ts` must be pure — fixtures of real GraphQL responses drive unit tests; `queries.ts` is the single linted home of query text.)

## Rollout

1. Add registry entries (`observability.conventions.validate` green); implement `observability.delivery.validate` with fixtures; wire into `PACKAGES_CHECK_PIPELINE`; regenerate command manifest.
2. Implement the poller with fixture-driven tests (response → points; watermark restart semantics: resume, no double-push).
3. Founder/ops: create the scoped Cloudflare token; fill `zones.jsonc` zone ids; add token to the VPS `.env`.
4. Deploy via `compose.extra.yaml`; verify `wgogol_delivery_requests_total` per site in SigNoz; record the query in the implementing PR.
5. New sites: `OBS-DLV-04` nags until the zone map gains the entry.

## Alternatives considered

- **Logpush (per-request logs) into the collector.** Rejected: plan-gated, high volume, per-visitor fields — wrong side of the Matomo/GDPR boundary; aggregates answer the operational questions.
- **A Cloudflare Worker cron as the poller.** Rejected: needs state (watermark) and would put the CF-watching component inside CF; the VPS already hosts scheduled services with volumes.
- **Zone auto-discovery via API.** Rejected: an authored, validated map is smaller, reviewable, and avoids accidentally ingesting non-fleet zones on the same account.
- **Scraping the CF dashboard REST endpoints per zone.** Rejected: the GraphQL API is the documented, stable surface for aggregated analytics.

## Risks

- **GraphQL schema/field drift.** Mitigated: queries centralized in `queries.ts` with recorded-fixture tests; a failing cycle skips and surfaces as a visible gap in the series rather than corrupt data.
- **Sampling in adaptive datasets.** Accepted: Cloudflare adaptive groups may sample under load; counts are operationally indicative, and the RFC documents this so dashboards label the series accordingly.
- **Double-push after crash between push and watermark write.** Mitigated: watermark is written before flush is confirmed in a write-ahead order documented in `watermark.ts`; worst case is a single skipped (never doubled) window — the conservative direction.
- **Token over-scope.** Mitigated: runbook mandates Analytics:Read-only token; the token never leaves the VPS `.env`.

## Acceptance criteria

- [x] `backs/cf-analytics-poller` exists per layout; boundaries clean; queries confined to `queries.ts`. (evidence: implemented historically)
- [x] Registry entries added; `observability.conventions.validate` green. (evidence: implemented historically)
- [x] `observability.delivery.validate` (OBS-DLV-01..04) fixture-tested, in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Poller unit tests: fixture response → exact metric points; watermark restart semantics (skip-not-double) proven. (evidence: implemented historically)
- [x] Deployed on the stack VPS; per-site delivery series visible in SigNoz (evidence in implementing PR). (evidence: implemented historically)
- [x] Command manifest regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence.
- Never add GraphQL dimensions beyond the allowed set; if a new dimension is needed, amend this RFC first (OBS-DLV-03 will fail you otherwise).
- Never poll visitor-level datasets; Matomo (RFC-0170/0305) owns visitor analytics.
- Keep `poll.ts` pure and network-free; all HTTP in `loop.ts`/client code with injected fetch for tests.
- The Cloudflare token creation and zone-id lookup are founder/ops steps; implement everything versioned and hand over the runbook line.
