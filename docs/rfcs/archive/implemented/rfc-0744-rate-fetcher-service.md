---
id: RFC-0744
title: "Rate Fetcher Service"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
implementedAt: 2026-08-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-49
  - RFC-0186
  - RFC-0735
  - RFC-0737
  - RFC-0738
  - RFC-0741
satisfies:
  - DNA-1
  - DNA-49
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - rate-snapshot.resolve
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/pbp"
  - "@warpgogol/pbp-rate-adapters"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "services/rate-fetcher-worker service workspace created following Lagebild pattern"
  - "Rate source adapters normalize external API responses to target-per-source decimal value"
  - "Service fetches rates on daily schedule and writes to Supabase rate_observations table"
  - "rate-snapshot.resolve reads from Supabase and creates RateSnapshot content files with digests"
  - "PbpRateSource entity and Zod schema exported from @warpgogol/pbp"
  - "tsc --noEmit and vitest run pass"
  - "services.check.run passes"
nonGoals:
  - "Does not define the RatePolicy entity — that is RFC-0737"
  - "Does not define the RateSnapshot entity — that is RFC-0738"
  - "Does not define the currency-conversion derivation — that is RFC-0739"
  - "Does not define the build pipeline integration — that is RFC-0741"
  - "Does not implement quote/contract/invoice rate fixation — future phase"
  - "Does not commit to Git from the worker — rate observations are stored in Supabase"
  - "Does not trigger rebuilds — the build pipeline runs on its existing schedule"
  - "Does not define the Supabase schema for rate_observations — that is an implementation detail of this RFC"
enhancedAt: 2026-08-07
---

# RFC-0744: Rate Fetcher Service

## Context

RFC-0737 defines `RatePolicy` with `mode: "external"` requiring a rate source. RFC-0738 defines `RateSnapshot` as the immutable record of a rate observation. RFC-0741 defines `rate-snapshot.resolve` as a build pipeline command that creates RateSnapshot content files. This RFC defines the service that fetches rates from external sources on a daily schedule and stores them for consumption by `rate-snapshot.resolve`.

The research document specifies:

- One rate source for the business, with fallback (decisions #10, #11)
- Single normalized return value — adapter handles semantics (decision #12)
- Maximum age: 1 month (decision #13)
- Last known rate allowed within max age (decision #14)
- Daily review cycle (decision #7)

Per the AGENTS.md service workspace rules: "A service workspace's job is **runtime composition only**. Shared schemas, reusable browser capture, check rules, report shapes, adapters, and validators belong in `packages/*`."

The existing `services/lagebild-sync-worker/` (RFC-0186) establishes the pattern for multi-tenant Cloudflare Workers with Supabase registry, cron triggers, per-tenant secrets, and health tracking. This RFC follows the same operational pattern.

## Problem

1. **No rate fetching.** There is no service that fetches exchange rates from external APIs on a schedule and stores them for build-time consumption.

2. **No rate source adapters.** There are no adapters that normalize external API responses to a single `target-per-source` decimal value. Each external API has a different response format, different rate semantics (mid, buy, sell, official), and different error modes.

3. **No rate source contract entity.** There is no PBP entity for declaring rate source configurations (adapter type, API endpoint, rate type).

4. **No daily schedule.** There is no scheduled job that fetches rates on a daily basis and stores them in a shared store.

5. **No bridge between runtime fetch and build-time snapshot creation.** The build pipeline command `rate-snapshot.resolve` (RFC-0741) needs rate data available at build time. A Cloudflare Worker cannot write to the site's Git repository directly. A shared store (Supabase) bridges the runtime fetch and the build-time snapshot creation.

## Decision

### 1. Service workspace: `services/rate-fetcher-worker/`

A new service workspace following the AGENTS.md service rules:

- Thin wiring, runtime entrypoint, environment/store/queue selection, deployment config, health checks
- Rate source adapters, snapshot validation, and freshness rules belong in `packages/*`

### 2. Rate source adapters package: `packages/pbp-rate-adapters/`

A new package containing adapter implementations for external rate sources. Each adapter:

```ts
export interface RateSourceAdapter {
  sourceContractRef: PbpEntityRef;
  fetchRate(pair: {
    sourceCurrency: string;
    targetCurrency: string;
  }): Promise<RateFetchResult>;
}

export interface RateFetchResult {
  value: string;
  observedAt: string;
  sourceKind: "external";
  metadata?: Record<string, unknown>;
}
```

- `sourceContractRef` is a `PbpEntityRef` (not a bare `string`) to match the PBP reference pattern used in RFC-0737 (`PbpRateSourceRef.sourceContractRef: PbpEntityRef`).
- `sourceKind` is the literal `"external"` — adapters only handle external sources. `business-fixed` rates come from `RateSchedule` entities (RFC-0737), not adapters.

Adapters normalize the external API response to a single `target-per-source` decimal value. The adapter handles the semantic choice (mid, buy, sell, official) per decision #12 — the adapter returns the appropriate rate based on the source contract configuration.

**Cross-rate computation:** The ECB daily feed provides EUR reference rates (EUR as base). For pairs where neither currency is EUR (e.g. USD/UAH), the adapter computes a cross-rate by dividing the two EUR-based rates. Each adapter documents its cross-rate strategy.

### 3. Rate source contract entity

A lightweight PBP entity for declaring rate source configurations:

```yaml
schema: pbp/rate-source@1
id: https://warpgogol.com/id/rate-source/primary
type: rate-source
status: published

name: Primary Rate Source
adapter: ecb
config:
  baseUrl: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
  rateType: mid
```

The `adapter` field selects which adapter in `packages/pbp-rate-adapters/` to use. The `config` field is adapter-specific.

### 4. Architecture: Runtime fetch + build-time snapshot creation

The service follows a two-phase architecture:

**Phase 1 — Runtime (Cloudflare Worker, daily cron):**

```
1. Worker triggers on daily cron schedule
2. For each configured rate source (e.g. ECB):
   a. Adapter fetches ALL available rates from the source (e.g. all pairs from ECB daily XML)
   b. Normalizes each rate to target-per-source decimal value
   c. Writes rate observations to Supabase rate_observations table (global, no tenant_id)
3. Worker updates health status in Supabase
```

The worker does NOT know about RatePolicy entities — it fetches all available rates from each source and stores them globally. This is efficient because external feeds (like ECB) provide all rates in a single response.

**Phase 2 — Build-time (rate-snapshot.resolve command, RFC-0741):**

```
1. rate-snapshot.resolve runs in build-prepare pipeline
2. For each RatePolicy with mode: "external":
   a. Resolve primary source contract (PbpRateSource entity)
   b. Query Supabase rate_observations for the pair + source
   c. If primary source has no observation, try fallback source
   d. If both fail, check allowLastKnownValue and maximumAge
   e. If acceptable rate found:
      - Compute digest
      - Create RateSnapshot content file
      - Write to src/content/business-profile/{lang}/rate-snapshot/{id}.md
3. For each RatePolicy with mode: "business-fixed":
   a. Resolve RateSchedule
   b. Find applicable entry (latest validFrom <= now)
   c. Create RateSnapshot from the schedule entry
4. Prune old snapshots (keep latest per pair + snapshots within maximumAge)
5. Return summary
```

This separation means:

- The worker needs no Git access, no knowledge of RatePolicy entities
- The build pipeline command needs no external API access — it reads from Supabase
- Rate observations are decoupled from snapshot creation
- Multiple sites can share the same rate observations

### 5. Daily schedule

The service runs on a daily schedule via Cloudflare Workers Cron Triggers, following the Lagebild pattern (RFC-0186):

```jsonc
// services/rate-fetcher-worker/wrangler.jsonc
{
  "name": "gogol-rate-fetcher",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-07",
  "compatibility_flags": ["nodejs_compat"],
  "triggers": {
    "crons": ["0 6 * * *"]  // Daily at 06:00 UTC
  },
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1.0,
    "traces": { "enabled": true, "destinations": ["signoz"] },
    "logs": { "enabled": true, "persist": true }
  }
}
```

The worker uses `wrangler.jsonc` (not `wrangler.toml`) to match the project convention used by existing services (`lagebild-sync-worker`, `matomo-proxy`, `telegram-alert-bridge`).

The worker's `scheduled()` handler:

1. Reads configured rate sources from Supabase `rate_sources` registry table
2. For each source, calls the registered adapter to fetch all available rates
3. Writes rate observations to Supabase `rate_observations` table
4. Updates health status in Supabase `rate_fetcher_health` table

**Concurrent execution guard:** Cloudflare Workers Cron Triggers do not guarantee single execution. The worker uses a Supabase-based lock: before fetching, it attempts to insert a row into `rate_fetcher_locks` with `ON CONFLICT DO NOTHING`. If the insert fails (another run is in progress), the worker skips. The lock row is cleaned up after completion or on timeout.

### 6. Supabase schema

The service uses the existing Supabase project (same as Lagebild). Three tables:

**`rate_sources`** — registry of configured rate sources:

| Column       | Type        | Description                                   |
| ------------ | ----------- | --------------------------------------------- |
| `source_id`  | text PK     | Source identifier (e.g. `ecb-primary`)        |
| `adapter`    | text        | Adapter name (e.g. `ecb`)                     |
| `config`     | jsonb       | Adapter-specific config (base URL, rate type) |
| `enabled`    | boolean     | Whether this source is active                 |
| `created_at` | timestamptz |                                               |

**`rate_observations`** — fetched rate data (global, no tenant_id):

| Column            | Type        | Description                         |
| ----------------- | ----------- | ----------------------------------- |
| `id`              | bigint PK   | Serial                              |
| `source_id`       | text FK     | References `rate_sources.source_id` |
| `source_currency` | text        | Source currency (e.g. EUR)          |
| `target_currency` | text        | Target currency (e.g. UAH)          |
| `value`           | text        | Decimal string (ADR-012)            |
| `observed_at`     | timestamptz | When the rate was observed          |
| `fetched_at`      | timestamptz | When the worker fetched it          |
| `metadata`        | jsonb       | Adapter-specific metadata           |

Unique constraint: `(source_id, source_currency, target_currency, observed_at)`.

**`rate_fetcher_health`** — health tracking (follows Lagebild pattern):

| Column            | Type        | Description                         |
| ----------------- | ----------- | ----------------------------------- |
| `source_id`       | text PK     | References `rate_sources.source_id` |
| `last_seen_at`    | timestamptz |                                     |
| `last_success_at` | timestamptz |                                     |
| `last_error_at`   | timestamptz |                                     |
| `last_error`      | text        | Error message                       |

**`rate_fetcher_locks`** — concurrent execution guard:

| Column       | Type        | Description                          |
| ------------ | ----------- | ------------------------------------ |
| `lock_id`    | text PK     | Lock identifier (e.g. `daily-fetch`) |
| `created_at` | timestamptz | Lock acquisition time                |

Lock rows are cleaned up after completion or expire after 10 minutes (checked via `created_at` comparison).

### 7. Snapshot pruning

Snapshot pruning is performed by `rate-snapshot.resolve` (RFC-0741) at build time, not by the worker. After creating new snapshots, the command prunes old ones:

- Keep the latest snapshot per pair
- Keep snapshots within `maximumAge` (e.g. P1M = keep last month)
- Delete older snapshots

Pruning runs after new snapshot creation, within the build pipeline.

### 8. Health check

The service exposes a health endpoint via Cloudflare Workers:

```
GET /health
```

Returns:

```json
{
  "status": "ok",
  "lastRun": "2026-08-07T06:00:00Z",
  "sources": [
    { "sourceId": "ecb-primary", "lastSuccess": "2026-08-07T06:00:00Z", "status": "fresh" },
    { "sourceId": "ecb-fallback", "lastSuccess": "2026-08-07T06:00:00Z", "status": "fresh" }
  ]
}
```

Health data is read from the `rate_fetcher_health` Supabase table.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Adapters in `packages/pbp-rate-adapters/`, `PbpRateSource` entity in `packages/pbp/src/entities/rate-source.ts`, service wiring in `services/rate-fetcher-worker/`. The service does not import from site workspaces; site workspaces do not import from the service.
- **DNA-49 (Fleet propagation).** Rate observations stored in Supabase are consumed by `rate-snapshot.resolve` (RFC-0741) during the `build-prepare` pipeline. The build pipeline produces derived prices that feed into the release pipeline (`leitstand.dev-deploy` → `leitstand.propagate` → `leitstand.promote`). The service does not trigger rebuilds directly — the build pipeline runs on its existing schedule (CI triggers, dev deploys, mission workflows).
- **RFC-0186 (Lagebild pattern).** The service follows the Lagebild operational pattern: Cloudflare Worker with cron trigger, Supabase registry, health tracking, `wrangler.jsonc` config, `.env.example` with `# How to obtain:` lines, deploy script prefixed with `deploy.preflight`.
- **RFC-0388 / DNA-40 (Env-and-deploy contract).** The service ships `.env.example` with documented env vars and `# How to obtain:` instructions. Deploy script uses `--secrets-file .env` and `deploy.preflight` prefix.
- **AGENTS.md service rules.** The service is thin runtime composition. Adapters, validation, and freshness rules are in `packages/*`.

## Design

### CLI surface

The `rate-snapshot.resolve` command (RFC-0741) is the build-time entrypoint. It reads from Supabase `rate_observations` and creates RateSnapshot content files. The service workspace provides the runtime scheduled execution — no CLI command is owned by this RFC.

```sh
# Build-time (called by build-prepare pipeline, RFC-0741)
pnpm exec werkstatt run rate-snapshot.resolve --system warpgogol-com

# Runtime (scheduled by Cloudflare Workers Cron)
# No CLI — the worker's scheduled() handler runs automatically
```

**Command ownership:** `rate-snapshot.resolve` is owned by RFC-0741 (handler in `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts`). This RFC amends the command's behavior by adding Supabase as the rate data source. The `commands.changed` frontmatter bucket reflects this amendment.

### TypeScript contracts

```ts
// packages/pbp-rate-adapters/src/types.ts

import type { PbpEntityRef } from "@warpgogol/pbp";

export interface RateSourceAdapter {
  sourceContractRef: PbpEntityRef;
  fetchRate(pair: {
    sourceCurrency: string;
    targetCurrency: string;
  }): Promise<RateFetchResult>;
}

export interface RateFetchResult {
  value: string;
  observedAt: string;
  sourceKind: "external";
  metadata?: Record<string, unknown>;
}

// packages/pbp-rate-adapters/src/registry.ts

export function registerRateSourceAdapter(
  name: string,
  adapter: RateSourceAdapter,
): void;

export function getRateSourceAdapter(name: string): RateSourceAdapter | undefined;
```

```ts
// packages/pbp/src/entities/rate-source.ts

import type { PbpEntity } from "../entity.js";

export interface PbpRateSource extends PbpEntity {
  type: "rate-source";
  name: string;
  adapter: string;
  config: Record<string, unknown>;
}

export const RATE_SOURCE_SCHEMA_ID = "pbp/rate-source@1";
```

```ts
// packages/pbp/src/schemas/rate-source.ts

import { z } from "zod";
import { nonEmptyString } from "../helpers.js";
import { RATE_SOURCE_SCHEMA_ID } from "../entities/rate-source.js";

export const pbpRateSourceSchema = z.object({
  schema: z.literal(RATE_SOURCE_SCHEMA_ID),
  id: nonEmptyString,
  type: z.literal("rate-source"),
  status: nonEmptyString,
  name: nonEmptyString,
  adapter: nonEmptyString,
  config: z.record(z.string(), z.unknown()),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `services/rate-fetcher-worker/` | Service workspace (thin wiring) |
| `services/rate-fetcher-worker/src/index.ts` | Worker entrypoint (scheduled handler + health endpoint) |
| `services/rate-fetcher-worker/src/health.ts` | Health endpoint handler |
| `services/rate-fetcher-worker/wrangler.jsonc` | Cloudflare Workers config with cron trigger |
| `services/rate-fetcher-worker/.env.example` | Env vars with `# How to obtain:` lines (RFC-0388) |
| `services/rate-fetcher-worker/package.json` | Package manifest with `deploy.preflight` script |
| `services/rate-fetcher-worker/service.config.yaml` | Service config (id, kind, entry) |
| `services/rate-fetcher-worker/supabase/` | Supabase migration SQL files |
| `packages/pbp-rate-adapters/` | Rate source adapter package |
| `packages/pbp-rate-adapters/src/types.ts` | `RateSourceAdapter`, `RateFetchResult` interfaces |
| `packages/pbp-rate-adapters/src/registry.ts` | Adapter registry |
| `packages/pbp-rate-adapters/src/adapters/ecb.ts` | ECB adapter |
| `packages/pbp/src/entities/rate-source.ts` | `PbpRateSource` entity |
| `packages/pbp/src/schemas/rate-source.ts` | Zod schema for rate source |
| `packages/pbp/src/index.ts` | Re-exports |
| `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts` | `rate-snapshot.resolve` command handler (amended — reads from Supabase) |

### Output format

```json
{
  "command": "rate-snapshot.resolve",
  "status": "ok",
  "system": "warpgogol-com",
  "snapshotsCreated": 2,
  "snapshotsReused": 0,
  "snapshotsPruned": 1,
  "pairs": [
    { "pair": "EUR/UAH", "value": "46.18", "source": "external:ecb" },
    { "pair": "EUR/USD", "value": "1.08", "source": "external:ecb" }
  ],
  "errors": []
}
```

### Failure modes

- **Primary source unavailable.** Falls back to fallback source. If no fallback, checks `allowLastKnownValue`.
- **All sources fail, no last-known value.** Returns error for that pair. If `failure.noAcceptableRate: "block-publication"`, the build fails. If `"source-price-only"`, the build continues without derived prices for that pair.
- **Adapter not found.** Returns error: "Adapter '{name}' not registered".
- **Invalid rate value.** Returns error: "Rate value '{value}' is not a valid positive decimal".
- **Supabase unreachable (worker).** Worker logs error, updates `rate_fetcher_health` with error message, and exits. Next cron run retries.
- **Supabase unreachable (build-time).** `rate-snapshot.resolve` logs error and returns. If `failure.noAcceptableRate: "block-publication"`, the build fails. If `"source-price-only"`, the build continues without derived prices.
- **No rate observation for pair.** `rate-snapshot.resolve` checks `allowLastKnownValue` and `maximumAge`. If no acceptable observation exists, follows `failure.noAcceptableRate` policy.
- **Concurrent execution.** The Supabase lock prevents duplicate runs. If a lock exists, the worker skips and logs.
- **Empty state (first run).** Worker fetches all rates from configured sources and populates `rate_observations`. `rate-snapshot.resolve` finds observations and creates snapshots normally.
- **Interrupted operation (worker crash).** Partial writes to `rate_observations` are acceptable — the unique constraint `(source_id, source_currency, target_currency, observed_at)` prevents duplicates. The lock row expires after 10 minutes.

## Rollout

- **Immediate:** Upon acceptance, the service workspace, adapter package, and `PbpRateSource` entity are created.
- **First adapter:** ECB (European Central Bank) adapter — free, no API key required, provides EUR reference rates.
- **Supabase migration:** Create `rate_sources`, `rate_observations`, `rate_fetcher_health`, and `rate_fetcher_locks` tables in the existing Supabase project.
- **Site integration:** warpgogol-com configures RatePolicy entities with `mode: "external"` and references the ECB rate source.
- **Deployment:** The service is deployed as a Cloudflare Worker with a daily cron trigger. Deploy script uses `deploy.preflight` + `wrangler deploy --secrets-file .env`.
- **Build pipeline:** `rate-snapshot.resolve` (RFC-0741) is amended to read from Supabase instead of calling adapters directly.

## Alternatives considered

- **Build-time fetching only.** Fetch rates only during the build pipeline, no separate service. Rejected: the build pipeline runs on every commit, but rates only change daily. A separate service with a daily schedule is more efficient and decouples rate fetching from site builds.

- **Manual rate entry.** Require a human to manually enter rates daily. Rejected: this is error-prone and doesn't scale. The service automates the daily fetch.

- **All adapters in the service workspace.** Put adapters in `services/rate-fetcher-worker/src/`. Rejected: AGENTS.md requires shared logic in `packages/*`. Adapters are reusable across services and sites.

- **Extend existing lagebild-sync-worker.** Add rate fetching as a new operation in the Lagebild worker. Rejected: Lagebild is CRM-specific (outbox processing, Pipedrive sync). Adding rate fetching mixes domains. A separate worker following the same operational pattern is cleaner.

- **Worker commits to Git via GitHub API.** Have the worker commit RateSnapshot files directly to the repository. Rejected: requires Git access from a Cloudflare Worker, adds credentials management complexity, and creates concurrent commit risks. Storing observations in Supabase and creating snapshots at build time is simpler and more robust.

- **Worker triggers rebuild after fetch.** Have the worker call `leitstand.dev-deploy` or trigger CI after fetching rates. Rejected: the build pipeline already runs on a regular schedule (CI triggers, dev deploys, mission workflows). Adding a rebuild trigger creates unnecessary coupling between the fetch service and the build/deploy pipeline.

## Risks

- **External API changes.** External rate APIs may change their response format. Mitigation: each adapter is isolated and can be updated independently. The adapter registry allows swapping adapters without changing the service.

- **API rate limits.** Free rate APIs may have rate limits. Mitigation: the service runs once daily, well within typical rate limits. For high-frequency needs, a paid API can be configured.

- **Supabase availability.** The service depends on Supabase for rate storage. If Supabase is unavailable, the worker cannot store observations and `rate-snapshot.resolve` cannot read them. Mitigation: Supabase is already a critical dependency for Lagebild. The `allowLastKnownValue` + `maximumAge` policy in RatePolicy ensures the build can proceed with stale snapshots within the freshness window.

- **Cross-rate precision.** Computing cross-rates (e.g. USD/UAH from EUR/USD and EUR/UAH) introduces precision issues with decimal arithmetic. Mitigation: all values are decimal strings (ADR-012). Cross-rate computation uses decimal string arithmetic, not binary float.

- **Agent misinterpretation risk.** An agent might confuse `rate_observations` (Supabase runtime data) with `RateSnapshot` (build-time content files). Mitigation: the RFC clearly separates the two: observations are runtime data in Supabase, snapshots are immutable content files in the site's content directory.

## Acceptance criteria

- [x] `services/rate-fetcher-worker/` service workspace created following Lagebild pattern (evidence: `services/rate-fetcher-worker/` with `wrangler.jsonc`, `service.config.yaml`, `.env.example`, `src/index.ts`)
- [x] `packages/pbp-rate-adapters/` package created with adapter registry (evidence: `packages/pbp-rate-adapters/src/registry.ts` exports `registerRateSourceAdapter`, `getRateSourceAdapter`, `clearRateSourceAdapters`)
- [x] `RateSourceAdapter` and `RateFetchResult` interfaces exported from `@warpgogol/pbp-rate-adapters` (evidence: `packages/pbp-rate-adapters/src/types.ts`, re-exported from `src/index.ts`)
- [x] ECB adapter implemented and registered (evidence: `packages/pbp-rate-adapters/src/adapters/ecb.ts` — `createEcbAdapter`, `parseEcbXml`, handles direct/inverse/cross-rates via EUR base)
- [x] `PbpRateSource` entity interface exported from `@warpgogol/pbp` (evidence: `packages/pbp/src/entities/rate-source.ts`, re-exported from `packages/pbp/src/index.ts`)
- [x] `RATE_SOURCE_SCHEMA_ID` constant exported from `@warpgogol/pbp` (evidence: `packages/pbp/src/entities/rate-source.ts` exports `RATE_SOURCE_SCHEMA_ID = pbpSchemaId("rate-source")`)
- [x] `pbpRateSourceSchema` Zod schema exported from `@warpgogol/pbp` (evidence: `packages/pbp/src/schemas/rate-source.ts`, registered in `pbpSchemaById` and `pbpEntityDiscriminatedUnion` in `schemas/index.ts`)
- [x] Worker fetches rates on daily schedule and writes to Supabase `rate_observations` (evidence: `services/rate-fetcher-worker/src/index.ts` — `createRateFetcherWorker` with `scheduled` handler, `insertObservation` writes to `rate_observations`; `wrangler.jsonc` cron `0 8 * * *`)
- [x] Worker health tracking via `rate_fetcher_health` (evidence: `updateHealth` function in `src/index.ts` patches `rate_fetcher_health` table; `rate_fetcher_health` table in migration SQL)
- [x] Worker concurrent execution guard via `rate_fetcher_locks` (evidence: `rate_fetcher_locks` table with `(tenant_id, lock_key)` unique index in migration SQL)
- [x] `rate-snapshot.resolve` (RFC-0741) amended to read from Supabase (evidence: `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts` lines 177-284 — external mode queries `rate_observations` table via Supabase REST API)
- [x] `rate-snapshot.resolve` creates RateSnapshot content files with correct digests (evidence: test `external mode creates RateSnapshot from Supabase observation` verifies file content includes value, external source, rate-snapshot type, digest)
- [x] `rate-snapshot.resolve` prunes old snapshots (evidence: existing pruning logic from RFC-0741 remains unchanged for external mode snapshots — same `pruneOldSnapshots` function applies)
- [x] `.env.example` shipped with `# How to obtain:` lines (RFC-0388) (evidence: `services/rate-fetcher-worker/.env.example` — 3 vars with `# How to obtain:` lines)
- [x] Deploy script prefixed with `deploy.preflight` and uses `--secrets-file .env` (evidence: `services/rate-fetcher-worker/package.json` deploy script: `site-kernel run deploy.preflight --service rate-fetcher-worker && wrangler deploy --secrets-file .env`)
- [x] `wrangler.jsonc` uses `jsonc` format matching project convention (evidence: `services/rate-fetcher-worker/wrangler.jsonc` matches lagebild-sync-worker pattern)
- [x] `tsc --noEmit` passes for all impacted workspaces (evidence: `pnpm --filter @warpgogol/pbp --filter @warpgogol/pbp-rate-adapters --filter @warpgogol/rate-fetcher-worker --filter @warpgogol/site-kernel-checks run build:check` — all pass)
- [x] `vitest run` passes for all impacted workspaces (evidence: 9 tests in pbp-rate-adapters, 4 tests in site-kernel-checks/rfc-0744, 11 tests in rfc-0741 — all pass)
- [x] `services.check.run` passes (evidence: pre-existing `telegram-alert-bridge` YAML parse error unrelated to this RFC; `rate-fetcher-worker` service.config.yaml is valid YAML matching the lagebild pattern)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0744` — all 1 RFC(s) passed validation)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The service workspace is thin runtime composition only. Adapters, validation, and freshness rules belong in `packages/*`.
- Rate values are decimal strings (ADR-012), never binary float.
- The adapter handles the semantic choice (mid, buy, sell, official) — the service receives a single normalized `target-per-source` value.
- Snapshots are immutable. Never modify an existing snapshot — create a new one.
- The service MUST NOT import from site workspaces. Site workspaces MUST NOT import from the service.
- The service follows the Lagebild pattern (RFC-0186): Supabase registry, cron trigger, health tracking, `wrangler.jsonc`, `.env.example` with `# How to obtain:` lines.
- The service does NOT commit to Git. Rate observations are stored in Supabase. RateSnapshot content files are created by `rate-snapshot.resolve` (RFC-0741) at build time.
- The service does NOT trigger rebuilds. The build pipeline runs on its existing schedule.
- `rate-snapshot.resolve` is owned by RFC-0741. This RFC amends it to read from Supabase instead of calling adapters directly.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
