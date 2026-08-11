---
id: service-health-contour
title: "Service health contour: periodic health probing for backend services"
createdAt: 2026-08-11
status: explored
related:
  - RFC-0807
---

# Exploration: Service health contour — periodic health probing for backend services

## Idea

The operator wants a new contour in the Werkstatt: periodic health monitoring for backend services (`services/*`). After deploying a service, the platform should periodically probe it to determine whether it is healthy. Each service kind needs its own set of health indicators. The number of services is small now but will grow, so the design must be scalable.

The key questions:

- What health indicators make sense per service kind?
- How should probes be declared and executed?
- Where should health state be recorded?
- How should unhealthy services be surfaced?

## Codebase findings

### Current service inventory

**5 registered Cloudflare Worker services** (in `services/registry.yaml`):

| Service | Kind | Health endpoint | Has upstream? | Has cron? |
| --- | --- | --- | --- | --- |
| `matomo-proxy` | `proxy-worker` | `/_wg/analytics/health` | yes (matomo-cloud) | no |
| `rate-fetcher` | `scheduled-worker` | `/health` | yes (ECB, Supabase) | yes (daily) |
| `lagebild-sync` | `scheduled-worker` | `/health` | yes (Pipedrive, Supabase) | yes (scheduled) |
| `telegram-alert-bridge` | `proxy-worker` | `/health` | yes (Telegram API) | no |
| `maturity-score` | `cloudflare-worker` | `/health` | no | no (request-triggered) |

**3 unregistered Node-based services** (not in `registry.yaml`):

| Service | Kind | Runtime | Health endpoint | Metrics |
| --- | --- | --- | --- | --- |
| `check-runner` | `node-runner` | Node process, queue consumer | none | none |
| `fleet-probe-runner` | `scheduled-worker` (Node) | Node loop (`setTimeout`) | none | OTLP to SigNoz |
| `cf-analytics-poller` | `scheduled-worker` (Node) | Node loop (`setTimeout`) | none | OTLP to SigNoz |

**1 compose stack** (in `registry.yaml` conceptually but not registered):

| Service               | Kind            | Health command                          |
| --------------------- | --------------- | --------------------------------------- |
| `observability-stack` | `compose-stack` | `observability.stack.health` (existing) |

### Existing health check infrastructure

**`runHealthCheck`** (`@/packages/werkstatt/src/leitstand/service-deploy-helpers.ts:141-155`):

- Single HTTP fetch to `url + healthCheckPath`
- Binary: `status < 500` → `"healthy"`, else `"unhealthy"`
- Runs **once** after deploy (in `service-dev-deploy.ts` and `service-promote.ts`)
- No periodic polling, no state recording beyond `lastDeployed.state`

**`leitstand.health`** (`@/packages/werkstatt/src/leitstand/leitstand-commands.ts:2643-2688`):

- For Sternsystem sites, not services
- Probes up to 10 routes from behavior snapshot
- Checks HTTP status + content hash match
- Returns `{ state, checks[] }` with per-probe details

**`observability.stack.health`** (`@/packages/werkstatt/src/observability/commands/stack-health.ts`):

- 3 checks: UI reachable, ingest rejects tokenless, smoke metric round-trip
- Returns `{ command, checks[] }` with per-check `ok` + `detail`
- This is the closest existing pattern to what we need for services

**`rate-fetcher` already has a health table in Supabase** (`@/services/rate-fetcher/src/index.ts:117-139`):

- `rate_fetcher_health` table with `last_seen_at`, `last_success_at`, `last_error_at`, `last_error`
- Updated after each scheduled run per source
- This is application-level health, not platform-level

### Existing metrics infrastructure

- `fleet-probe-runner` pushes probe metrics via OTLP (`warpgogol_probe_up`, `warpgogol_probe_ttfb_seconds`, `warpgogol_probe_http_status_class_total`, `warpgogol_probe_content_ok`, `warpgogol_probe_cert_expiry_days`)
- `cf-analytics-poller` pushes delivery metrics via OTLP
- `createMetricsPusher` from `@warpgogol/werkstatt-site/observability` is the standard metrics pusher
- SigNoz is the observability backend (via `observability-stack`)

### Registry structure

`services/registry.yaml` tracks per-service:

- `healthCheckPath` — path to the health endpoint
- `lastDeployed` / `lastDevDeployed` — `{ at, state, operationId }`
- No `lastHealthCheck` or `healthState` field exists

### Service config files

Each service has a `service.config.yaml` with `id`, `kind`, `entry`, `publicEndpoints`, and kind-specific fields. No health probe declarations exist in these files.

### Relevant DNA invariants

- **DNA-40** — env-example and deploy-script contract for `services/*`
- **DNA-44** — Sternsystem bundle contract (services are NOT Sternsystemen, but the registry pattern is analogous)
- **DNA-64** — engine/plugin boundary (health probing logic belongs in `packages/werkstatt` if it's engine-level, or `packages/werkstatt-site` if it's site-plugin-level)

## Options

### Option 1: Probe declarations in `service.config.yaml` + `leitstand.service.health` command

- **Approach:** Each service declares its probes in `service.config.yaml` under a `healthProbes:` key. Probe templates per service kind provide defaults (e.g. `proxy-worker` gets liveness + upstream-reachability by default). A new `leitstand.service.health --service <id>` command runs all declared probes and returns aggregated state + per-probe details. A separate `leitstand.service.health-poll` command iterates all registered services and records results in `services/health-state.yaml`.
- **Trade-offs:**
  - **Pros:** Declarative, per-service customization, works for all service kinds (including Node loops and compose stacks), single command for on-demand and periodic use
  - **Cons:** New schema in `service.config.yaml`, new state file, need to define probe templates per kind
- **DNA alignment:** DNA-40 (service config), DNA-64 (logic in `packages/werkstatt`)
- **Blockers:** None — builds on existing `service.config.yaml` and `runHealthCheck` patterns
- **Estimated effort:** Medium — schema design, command implementation, probe templates, state recording

### Option 2: Extend `registry.yaml` with health state + simple HTTP polling

- **Approach:** Add `lastHealthCheck: { at, state, detail }` to each service entry in `registry.yaml`. A `leitstand.service.health-poll` command iterates all services, fetches their `healthCheckPath`, and records state. No probe declarations — just the existing HTTP health check, but periodic and stateful.
- **Trade-offs:**
  - **Pros:** Minimal schema change, reuses existing `runHealthCheck`, fast to implement
  - **Cons:** Only works for services with HTTP endpoints (misses Node loops and compose stacks), no functional probes (upstream reachability, data freshness), no per-service customization
- **DNA alignment:** DNA-40 (registry contract)
- **Blockers:** Does not cover `check-runner`, `fleet-probe-runner`, `cf-analytics-poller`, `observability-stack`
- **Estimated effort:** Small — extend registry, add poll command

### Option 3: OTLP metrics-based health (push, not pull)

- **Approach:** Each service pushes health metrics via OTLP (like `fleet-probe-runner` already does). Health state is derived from metric queries against SigNoz. No polling needed — services self-report. A `leitstand.service.health --service <id>` command queries SigNoz for recent metrics and derives health state.
- **Trade-offs:**
  - **Pros:** No external probe needed, works for Node loops without HTTP endpoints, real-time, leverages existing observability stack
  - **Cons:** Requires every service to push metrics (not all do today), depends on SigNoz availability (circular dependency if SigNoz is down), query-based health is harder to debug, `matomo-proxy` and `telegram-alert-bridge` are simple proxies that don't push metrics
- **DNA alignment:** DNA-64 (observability in `packages/werkstatt-site`)
- **Blockers:** `matomo-proxy`, `telegram-alert-bridge`, `maturity-score` don't push metrics today and would need code changes; SigNoz downtime = blind spot
- **Estimated effort:** Large — instrument every service + query layer + SigNoz client

### Option 4: Hybrid — probe declarations for HTTP services + OTLP for Node loops

- **Approach:** Combine Option 1 (for Cloudflare Workers with HTTP endpoints) and Option 3 (for Node loops that already push OTLP). `leitstand.service.health` checks the service kind: for Workers, run declared HTTP probes; for Node loops, query SigNoz for recent metric activity; for compose stacks, delegate to `observability.stack.health`.
- **Trade-offs:**
  - **Pros:** Best fit per service kind, leverages existing infrastructure where it exists, covers all service kinds
  - **Cons:** Two health mechanisms to maintain, more complex `leitstand.service.health` implementation, SigNoz dependency for Node loops
- **DNA alignment:** DNA-40, DNA-64
- **Blockers:** None, but complexity is higher
- **Estimated effort:** Medium-Large — probe declarations + OTLP query + delegation

## Recommendation

**Option 1 (probe declarations + `leitstand.service.health`)** is the best starting point.

Rationale:

1. **Covers all service kinds** — probe declarations can express HTTP liveness, functional probes, process liveness, and compose-stack delegation. Node loops can declare a "process liveness" probe that checks if the loop is running (via PID file or heartbeat file).
2. **Declarative and extensible** — new services declare their probes in `service.config.yaml`; new probe types can be added without changing the command.
3. **No SigNoz dependency** — health probing works even when the observability stack is down. OTLP metrics remain a complementary data source, not a prerequisite.
4. **Follows existing patterns** — `observability.stack.health` already demonstrates the multi-check pattern. `leitstand.health` demonstrates route probing. This is the service analogue.
5. **Node loops can be brought in incrementally** — `fleet-probe-runner` and `cf-analytics-poller` can be registered in `registry.yaml` with a "heartbeat file" probe (check if a timestamp file was recently written). `check-runner` can declare a "queue depth" probe.

**Health state recording:** Add `lastHealthCheck: { at, state, probes: { name, ok, detail }[] }` to each service entry in `registry.yaml`. This avoids a new state file and keeps all service state in one place. For periodic polling, a `leitstand.service.health-poll` command iterates all registered services.

**Probe templates per kind (defaults, overridable in `service.config.yaml`):**

| Kind | Default probes |
| --- | --- |
| `proxy-worker` | `http-liveness` (GET healthCheckPath), `upstream-reachability` (probe through proxy) |
| `scheduled-worker` (Worker) | `http-liveness`, `last-run-freshness` (check `rate_fetcher_health` or equivalent) |
| `cloudflare-worker` | `http-liveness`, `functional-probe` (e.g. POST /score with test payload) |
| `node-runner` | `process-liveness` (PID file or heartbeat), `queue-depth` (count pending items) |
| `scheduled-worker` (Node) | `heartbeat-freshness` (timestamp file written each cycle), `last-cycle-success` |
| `compose-stack` | delegate to `observability.stack.health` or equivalent |

**Alerting integration:** Unhealthy results from `leitstand.service.health-poll` can be forwarded to `telegram-alert-bridge` via its webhook endpoint. This closes the loop: the fleet monitors itself.

## Open questions

1. **Probe execution context** — should `leitstand.service.health-poll` run as a local command (invoked by cron or CI) or as a Cloudflare Worker cron? A local command is simpler but requires a host. A Worker cron is always-on but introduces a new Worker to maintain.
2. **Node loop heartbeat** — how should `fleet-probe-runner` and `cf-analytics-poller` write heartbeat files? They run as long-lived Node processes — should they write to a file in `.turbo/` or a dedicated `services/<id>/.health/` directory?
3. **`check-runner` liveness** — the check-runner is a queue consumer that may be idle for long periods. Is "process running" sufficient, or do we need "processed a run within the last N hours"?
4. **Probe timeouts** — what is the default timeout per probe? Should it be configurable per probe in `service.config.yaml`?
5. **Health state history** — should we keep only the latest health check result, or a rolling history (e.g. last 10 checks)? History enables trend analysis but adds complexity.
6. **Unregistered services** — `check-runner`, `fleet-probe-runner`, `cf-analytics-poller` are not in `registry.yaml`. Should they be registered first (with their kind and health probe config), or should health probing be opt-in?
7. **RFC scope** — is this one RFC or a series? The probe schema + `leitstand.service.health` command could be RFC-A, periodic polling + state recording RFC-B, and alerting integration RFC-C.
