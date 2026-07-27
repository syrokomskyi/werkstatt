---
id: RFC-0186
title: "Introduce a shared Lagebild sync worker with tenant registry"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-11
updatedAt: 2026-06-11
implementedAt: 2026-06-11
closedAt:
supersedes: []
supersededBy:
amends:
amendedBy:
  - RFC-0188
  - RFC-0190
  - RFC-0191
  - RFC-0385
  - RFC-0387
  - RFC-0365
related:
  - RFC-0176
  - RFC-0179
  - RFC-0181
  - RFC-0182
  - DNA-1
commands:
  proposed:
    - lagebild.tenant.add
    - lagebild.tenant.disable
    - lagebild.tenant.enable
    - lagebild.tenant.rotate-secret
    - lagebild.tenant.status
    - lagebild.validate
    - lagebild.worker.deploy
    - lagebild.worker.dev.vars.generate
    - lagebild.worker.dev.vars.validate
  added:
    - lagebild.tenant.add
    - lagebild.tenant.disable
    - lagebild.tenant.enable
    - lagebild.tenant.rotate-secret
    - lagebild.tenant.status
    - lagebild.validate
    - lagebild.worker.deploy
    - lagebild.worker.dev.vars.generate
    - lagebild.worker.dev.vars.validate
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/integration-adapter-supabase-crm
  - packages/os/site-kernel-checks
  - packages/os/site-kernel
successSignals:
  - "One shared Cloudflare Worker (`lagebild-sync`) syncs CRM buffer outbox for all clients, controlled by a Supabase `sync_tenants` registry."
  - "New clients are onboarded via CLI (`lagebild.tenant.add`) without creating per-site Worker folders."
  - "A single failure in one tenant does not affect others."
  - "The shared Worker never processes a tenant with missing or invalid secret references."
  - "Per-site sync Worker folders (`integrations/<site>/workers/supabase-sync/`) are gone."
nonGoals:
  - "Do not store raw API tokens or service keys in Supabase tables."
  - "Do not merge the sync cron into client site Workers (Astro entrypoint)."
  - "Do not create one Supabase database per client."
  - "Do not support non-cron triggers (event-driven, queue-driven) in this RFC."
---

# RFC-0186: Introduce a shared Lagebild sync worker with tenant registry

## Context

The Lagebild integration system writes lead and CRM events into a Supabase-backed CRM buffer and syncs them asynchronously to destination systems such as Pipedrive.

The pilot implementation placed per-site Cloudflare Cron Workers under `integrations/<site>/workers/supabase-sync/`. That layout works for a single client (`webgogol-com`), but it multiplies deployment targets: every new client creates another Worker, another `wrangler.jsonc`, another `package.json`, and another set of operational commands. The sync logic itself is shared (`createSupabaseSyncWorker()`), but the Worker envelope is not.

With the pilot volume low (≤ 50 sites × ≤ 10 events/day), the operational overhead is already visible. At scale, it becomes unsustainable: hundreds of thin Workers, fragmented observability, and no data-driven view of which tenants are active.

## Problem

- Each new client creates a new Worker deploy target, even though the sync logic is identical.
- There is no single place to inspect which tenants are enabled, healthy, or failing.
- Tenant lifecycle (enable, disable, rotate secrets) requires filesystem edits and re-deploys instead of data operations.
- Per-site Worker folders (`integrations/<site>/workers/supabase-sync/`) are treated as generated scaffolding but carry manual deploy and secret management overhead.
- The repository accumulates `integrations/<site>/workers/supabase-sync/` folders that are not the target architecture.

## Decision

A single shared Lagebild sync Worker replaces all per-site sync Workers. Tenant activation, routing, and operational control move into a Supabase `sync_tenants` registry.

1. **One shared Worker:** `integrations/lagebild-sync-worker/` is the only sync Worker deploy target. It runs a single cron schedule and processes all enabled tenants.
2. **Tenant registry:** `sync_tenants` in Supabase stores per-tenant metadata (site name, cron group, batch size, concurrency limits, circuit breaker threshold) and symbolic secret reference names. It does not store secret values.
3. **Secret resolution:** On each cron tick, the shared Worker reads enabled tenants, resolves secret references from its own Worker environment (`env[ref]`), creates a tenant-scoped `CrmBufferClient`, and processes that tenant's `sync_outbox` rows.
4. **Isolation:** A failure for one tenant (missing secret, Pipedrive API error, network timeout) is caught, logged per-tenant, and does not stop processing other tenants.
5. **CLI commands:** Site-kernel commands manage the tenant lifecycle (`add`, `enable`, `disable`, `status`, `rotate-secret`) and the Worker (`deploy`, `validate`).

## Architectural fit

- **Amends RFC-0180:** removes its per-site Worker provisioning model. The destination-hub contracts (`IntegrationEvent`, `DestinationAdapter`, `executeDispatch`) are unchanged.
- **RFC-0176 / RFC-0181:** the CRM buffer adapter (`supabaseBufferDestinationAdapter`) and delivery callback (`/api/integration-route`) remain unchanged. This RFC only changes the **outbound sync** side (Supabase → Pipedrive).
- **RFC-0182:** the shared Worker must still respect Cloudflare residency and secret-injection constraints. Tenant secrets are injected via `wrangler secret put`, never committed.
- **DNA-1:** one Worker per site still holds for the **site** (Astro static assets + on-demand routes). The sync Worker is a **platform** Worker, not a site Worker.

## Design

### Topology

```
[shared Lagebild sync Worker (cron)]
  │ read enabled tenants from sync_tenants
  │ resolve secret refs from Worker env
  │ for each tenant:
  │   create CrmBufferClient(tenantId, resolved secrets)
  │   read pending sync_outbox rows
  │   process with per-tenant batch_size / concurrency
  │   update outbox status
  │   update sync_tenants health columns
```

### TypeScript contracts

```ts
// packages/integration-adapter-supabase-crm/src/tenant-registry.ts

export interface SyncTenant {
  tenant_id: string;
  site_name: string;
  enabled: boolean;
  supabase_project_ref: string;
  supabase_url_secret_ref: string;
  supabase_service_key_secret_ref: string;
  destination_vendor: string;
  destination_token_secret_ref: string;
  destination_domain_secret_ref: string;
  cron_group: string;
  batch_size: number;
  max_concurrency: number;
  circuit_breaker_threshold: number;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantSecretRefs {
  supabase_url: string;
  supabase_service_key: string;
  destination_token: string;
  destination_domain: string;
}
```

### CLI surface

```sh
# Add a tenant (disabled by default)
pnpm exec site-kernel run lagebild.tenant.add --site webgogol-com --tenant-id <uuid-v7> --vendor pipedrive

# Enable after secrets are present
pnpm exec site-kernel run lagebild.tenant.enable --site webgogol-com

# Disable without deleting history
pnpm exec site-kernel run lagebild.tenant.disable --site webgogol-com

# Inspect tenant health and missing secrets
pnpm exec site-kernel run lagebild.tenant.status --site webgogol-com

# Rotate a secret reference
pnpm exec site-kernel run lagebild.tenant.rotate-secret --site webgogol-com --kind pipedrive-token

# Deploy the shared Worker
pnpm exec site-kernel run lagebild.worker.deploy

# Validate the entire surface
pnpm exec site-kernel run lagebild.validate
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/integration-adapter-supabase-crm/src/worker.ts` | Shared sync Worker logic (multi-tenant factory) |
| `packages/integration-adapter-supabase-crm/src/tenant-registry.ts` | Tenant CRUD + secret reference resolution |
| `packages/integration-adapter-supabase-crm/migrations/002_sync_tenants.sql` | DDL for `sync_tenants` |
| `integrations/lagebild-sync-worker/wrangler.jsonc` | Shared Worker deploy target |
| `integrations/lagebild-sync-worker/src/index.ts` | Thin wrapper: `export default createLagebildSharedSyncWorker()` |
| `docs/rfcs/rfc-0186-*.md` | This RFC |

### Output format (`--json`)

```json
{
  "command": "lagebild.tenant.status",
  "status": "ok",
  "tenant": {
    "tenant_id": "...",
    "site_name": "webgogol-com",
    "enabled": true,
    "last_seen_at": "2026-06-11T10:00:00Z",
    "last_success_at": "2026-06-11T10:00:00Z",
    "last_error": null,
    "pending_count": 3,
    "failed_count": 0,
    "dead_count": 0,
    "missing_secrets": []
  }
}
```

### Failure modes

- **Missing secret reference:** tenant is skipped, `last_error` updated, no global failure.
- **Pipedrive API error:** tenant-level circuit breaker increments; if threshold reached, remaining tenant tasks are deferred to next cron tick.
- **Supabase connection error:** tenant skipped; other tenants continue.
- **Invalid `tenant_id` in outbox:** row logged and skipped.
- **Tenant disabled (`enabled = false`):** silently skipped.

## Rollout

1. Add `002_sync_tenants.sql` migration to `packages/integration-adapter-supabase-crm/migrations/`.
2. Implement `tenant-registry.ts` and refactor `worker.ts` to multi-tenant factory in `@gogol/integration-adapter-supabase-crm`.
3. Create `integrations/lagebild-sync-worker/` as the shared deploy target.
4. Implement CLI commands under site-kernel.
5. Migrate `webgogol-com` into `sync_tenants` with `enabled = false`.
6. Add Cloudflare secrets to the shared Worker.
7. Enable `webgogol-com` and verify sync.
8. Remove `integrations/webgogol-com/workers/supabase-sync/`.
9. Add `lagebild.validate` to CI (`APPS_CHECK_PIPELINE`).

New sites that need Lagebild:

1. Add section (`chat-widget` or `send-message`) to content.
2. Run `lagebild.tenant.add --site <name>`.
3. Set secrets via `wrangler secret put`.
4. Run `lagebild.tenant.enable --site <name>`.
5. No per-site Worker folder is created.

## Alternatives considered

- **Keep per-site Workers:** rejected — multiplies deploy targets and observability fragmentation.
- **Merge sync cron into site Worker (Astro entrypoint):** rejected — mixes site HTTP traffic with background sync, increases blast radius, and complicates the Astro/cloudflare entrypoint.
- **Use Cloudflare Queues for tenant fan-out:** rejected — Queues cannot be EU-pinned (RFC-0181, RFC-0182).
- **Store secrets in Supabase:** rejected — violates the "secrets never in database" policy.

## Risks

- **Single point of failure:** one shared Worker outage affects all tenants. Mitigation: Cloudflare Worker auto-scaling and health checks; tenant-level circuit breakers prevent one bad tenant from starving others.
- **Secret rotation blast radius:** a bad secret update affects all tenants using that reference. Mitigation: secret references are per-tenant symbolic keys; rotation is tenant-scoped.
- **Rate limit amplification:** all tenants hit Pipedrive from one Worker IP. Mitigation: per-tenant concurrency limits; Pipedrive rate limits are per-account token, not per IP.
- **Agent confusion:** agents may still create per-site Worker folders if not explicitly guided. Mitigation: `lagebild.validate` fails on their presence; `rfc.validate` enforces this RFC's rules.

## Acceptance criteria

- [x] TypeScript types `SyncTenant`, `TenantSecretRefs`, and `createLagebildSharedSyncWorker` defined in `@gogol/integration-adapter-supabase-crm`. (evidence: packages/ directory, package exists)
- [x] `sync_tenants` DDL migration exists and typechecks. (evidence: implemented historically)
- [x] CLI commands registered with correct names and workspace scope. (evidence: implemented historically)
- [x] `--json` output format documented and stable. (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.generate` creates `.dev.vars.example` for local testing. (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.generate` supports `--force` to overwrite existing file. (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.validate` leak-guard fails on non-empty values. (evidence: implemented historically)
- [x] `lagebild.validate` checks for forbidden per-site Worker folders and `.dev.vars.example` leaks. (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.generate` runs in `APPS_BUILD_PREPARE_PIPELINE`. (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.validate` runs in `APPS_CHECK_AUTHOR_PIPELINE`. (evidence: implemented historically)
- [x] Shared Worker (`integrations/lagebild-sync-worker/`) deploys and processes `webgogol-com`. _(requires secrets + tenant activation)_ (evidence: implemented historically)
- [x] No `integrations/<site>/workers/supabase-sync/` folders exist. (evidence: implemented historically)
- [x] `lagebild.validate` integrated into `APPS_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `AGENTS.md` updated to prohibit per-site sync Worker creation. (evidence: AGENTS.md:1, agent guide updated)
- [x] Relevant DNA or spec docs reference this RFC. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT create per-site sync Worker folders (`integrations/<site>/workers/supabase-sync/`).
- Agents MUST route all new Lagebild onboarding through `lagebild.tenant.add`.
- Agents MUST check `rfc.list --status accepted` before making structural changes to `@gogol/integration-adapter-supabase-crm` or the sync Worker.
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions.
- Agents MUST NOT weaken or remove per-tenant isolation, secret reference resolution, or the "secrets never in database" rule.
