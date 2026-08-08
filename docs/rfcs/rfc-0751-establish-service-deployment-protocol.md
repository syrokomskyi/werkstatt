---
id: RFC-0751
title: "Establish service deployment protocol for shared Cloudflare Worker services"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0305
  - RFC-0379
  - RFC-0388
  - RFC-0628
  - RFC-0752
  - RFC-0753
  - DNA-40
satisfies:
  - DNA-40
versionBump: minor
commands:
  proposed:
    - leitstand.service.deploy
    - service.registry.validate
    - service.naming.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/ontology"
successSignals:
  - Any `services/*` Cloudflare Worker can be deployed to production via a single `leitstand.service.deploy --service <id>` command without manual wrangler invocations.
  - Service deployment state (lastDeployed, workerName, url) is tracked in a machine-readable service registry in `systems/registry.yaml`.
  - `deploy.preflight` runs automatically before every service deploy, blocking on missing or empty env values.
  - `subdomain.validate` runs automatically before every service deploy, blocking if DNS record or Workers route is missing (RFC-0752).
  - `service.naming.validate` enforces that Worker names match service IDs — no `gogol-*` or `warpgogol-*` prefixes.
  - The matomo-proxy service is the first production deployment using this protocol.
nonGoals:
  - Do not implement multi-channel (dev/alt/main) service deployment — services use a single production channel.
  - Do not implement CDN cache purge for services — services are Workers, not static sites.
  - Do not implement rollback for services — use `wrangler rollback` directly for now.
  - Do not implement Axiom evidence gates for services — services have no visitor-facing HTML to audit.
  - Do not implement DNS record management — that is RFC-0753.
  - Do not implement subdomain registration logic — that is RFC-0752. This RFC depends on RFC-0752 for the `subdomain.validate` gate.
---

# RFC-0751: Establish service deployment protocol for shared Cloudflare Worker services

## Context

The platform has a mature site deployment protocol (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`) with channels (dev/alt/main), health checks, CDN purge, and Axiom evidence gates. However, `services/*` Cloudflare Workers lack an equivalent protocol. Each service currently relies on a per-service `deploy` npm script that calls `wrangler deploy` directly:

```sh
# services/rate-fetcher-worker/package.json
"deploy": "site-kernel run deploy.preflight --service rate-fetcher-worker && wrangler deploy --secrets-file .env"
```

This works for simple cases but has gaps:

1. **No service registry** — there is no machine-readable record of which services are deployed, their Worker names, URLs, or last-deployed state. The site registry (`systems/registry.yaml`) tracks Sternsystemen, but services are absent.
2. **No leitstand command** — operators must `cd` into each service directory and run `pnpm deploy`. There is no centralized `leitstand.service.deploy --service <id>` command.
3. **No state tracking** — after a deploy, there is no persistent record of success/failure, Worker URL, or deployment timestamp.
4. **No health verification** — the site protocol verifies deployed routes via behavior snapshots; services have no equivalent post-deploy check.
5. **No naming consistency** — Worker names are ad-hoc: `gogol-rate-fetcher`, `gogol-lagebild-sync`, `telegram-alert-bridge`, `warpgogol-matomo-proxy`. No convention enforced.

The immediate trigger is the matomo-proxy service (`services/matomo-proxy`), which needs to be deployed to production as a **shared multi-tenant Worker** serving all sites (RFC-0305).

### Architectural principle: shared services

Services in `services/*` are **shared infrastructure** — one deployment serves all sites in the workshop. They are not per-client. This means:

- Worker names must be **bare** (e.g. `matomo-proxy`, not `warpgogol-matomo-proxy`) — no client prefix.
- Services are hosted on the **studio domain** (e.g. `matomo-proxy.warpgogol.com`), not per-client domains.
- The service registry tracks `hostedBy: studio` for shared services.

## Problem

**DNA-40** requires `services/*/package.json` deploy scripts to use `--secrets-file .env` and be prefixed with `deploy.preflight`. This is satisfied by existing per-service scripts. However, there is no:

- **Service registry** analogous to `systems/registry.yaml` for Sternsystemen.
- **Leitstand command** for centralized service deployment from the workspace root.
- **Post-deploy state recording** for audit trails and operational visibility.
- **Naming consistency enforcement** — Worker names drift from service IDs.
- **Subdomain validation** — no pre-deploy check that the service's subdomain is registered in Cloudflare DNS and Workers routes.

Without these, deploying a service is a manual, stateless operation with no audit trail and no consistency guarantees.

## Decision

The platform gains a **service deployment protocol** consisting of:

1. A **service registry** as a top-level `services:` key in `systems/registry.yaml`, recording service metadata, subdomains, and deployment state.
2. A **`leitstand.service.deploy`** command that runs `deploy.preflight`, `subdomain.validate` (RFC-0752), executes `wrangler deploy`, verifies the Worker is reachable via `*.workers.dev` URL, and records deployment state.
3. A **`service.registry.validate`** command that validates the registry structure and service config consistency.
4. A **`service.naming.validate`** command that enforces Worker name = service ID (bare, no prefixes).

### Service registry

Services are registered in a new `services:` top-level key in `systems/registry.yaml`:

```yaml
services:
  - id: matomo-proxy
    kind: proxy-worker
    workerName: matomo-proxy
    hostedBy: studio
    url: https://matomo-proxy.warpgogol.com
    workersDevUrl: https://matomo-proxy.<account>.workers.dev
    publicEndpoints: true
    routes:
      - /_wg/analytics/*
    upstreams:
      - matomo-cloud
    subdomains:
      - domain: matomo-proxy.warpgogol.com
        zone: warpgogol.com
    lastDeployed:
      at: null
      state: null
      operationId: null
```

### Naming convention

- `id` = `workerName` = directory name = `package.json` `name` (without `@warpgogol/` scope).
- No `gogol-*`, `warpgogol-*`, or other client prefixes.
- Existing Workers renamed:
  - `gogol-rate-fetcher` → `rate-fetcher`
  - `gogol-lagebild-sync` → `lagebild-sync`
  - `warpgogol-matomo-proxy` → `matomo-proxy`
  - `telegram-alert-bridge`, `cf-analytics-poller` — already bare, unchanged.

### CLI surface

```sh
# Deploy a service to production
pnpm exec site-kernel run leitstand.service.deploy --service matomo-proxy

# Validate the service registry
pnpm exec site-kernel run service.registry.validate

# Validate naming consistency
pnpm exec site-kernel run service.naming.validate
```

### TypeScript contracts

```ts
interface ServiceRegistryEntry {
  id: string;
  kind: "proxy-worker" | "cron-worker" | "api-worker";
  workerName: string;
  hostedBy: "studio" | "site";
  url: string;
  workersDevUrl: string;
  publicEndpoints: boolean;
  routes?: string[];
  upstreams?: string[];
  subdomains?: Array<{
    domain: string;
    zone: string;
  }>;
  lastDeployed: {
    at: string | null;
    state: "succeeded" | "failed" | null;
    operationId: string | null;
  };
}

interface ServiceDeployResult {
  command: "leitstand.service.deploy";
  serviceId: string;
  workerName: string;
  deployState: "succeeded" | "failed";
  workersDevUrl: string;
  healthState: "healthy" | "unhealthy" | "unknown";
  startedAt: string;
  completedAt: string;
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `systems/registry.yaml` | Gains `services:` top-level key with service entries |
| `services/<id>/service.config.yaml` | Existing per-service config, read by the registry builder |
| `services/<id>/wrangler.jsonc` | Existing wrangler config, `name` must match `id` |
| `services/<id>/.env` | Secrets file, validated by `deploy.preflight` |
| `services/<id>/package.json` | Existing deploy script remains as fallback; `leitstand.service.deploy` calls `wrangler deploy` directly |

### Output format

```json
{
  "command": "leitstand.service.deploy",
  "serviceId": "matomo-proxy",
  "workerName": "matomo-proxy",
  "deployState": "succeeded",
  "workersDevUrl": "https://matomo-proxy.syrokomskyi.workers.dev",
  "healthState": "healthy",
  "startedAt": "2026-08-08T11:30:00.000Z",
  "completedAt": "2026-08-08T11:30:15.000Z"
}
```

### Failure modes

- **Missing service in registry**: `leitstand.service.deploy` exits non-zero with a diagnostic message.
- **`deploy.preflight` failure**: Blocks the deploy, exits non-zero with DEPLOY-PREFLIGHT diagnostics.
- **`subdomain.validate` failure** (RFC-0752): `leitstand.service.deploy` automatically calls `subdomain.register` if validation reports "not registered". If `subdomain.register` fails, the deploy is blocked.
- **`wrangler deploy` failure**: Records `deployState: "failed"` in the registry, exits non-zero.
- **Health check failure**: Records `healthState: "unhealthy"`, exits non-zero. The Worker is still deployed (wrangler succeeded) but the operator is alerted.
- **Missing `.env` file**: `deploy.preflight` catches this before `wrangler deploy` runs.

## Architectural fit

- **DNA-40**: Extends the env-example and deploy-script contract with a centralized leitstand command and registry, building on the existing `deploy.preflight` gate.
- **RFC-0305**: The matomo-proxy service is the first consumer, activating first-party analytics proxy for all sites as a shared multi-tenant Worker.
- **RFC-0379**: Site deployment uses `leitstand.propagate` / `leitstand.promote` with channels. Services are simpler — single production channel, no CDN purge, no Axiom gate. This protocol is the service analogue.
- **RFC-0628**: Site dev-deploy is workpiece-based. Services have no workpiece — they deploy from `services/<id>/` directly.
- **RFC-0752**: Subdomain Management Protocol — `leitstand.service.deploy` depends on `subdomain.validate` as a pre-deploy gate and `subdomain.register` for automatic first-time registration.
- **RFC-0753**: DNS Record Management Protocol — orthogonal, manages arbitrary DNS records (MX, SPF, DKIM, etc.) not related to service deployment.

## Design

### leitstand.service.deploy

1. **Read registry** — find the service entry by `--service <id>`.
2. **Run `deploy.preflight`** — validate `.env` exists and has all keys from `.env.example` with non-empty values.
3. **Run `subdomain.validate`** (RFC-0752) — check DNS record + Workers route exist for each `subdomains[]` entry.
4. **If `subdomain.validate` reports "not registered"** — automatically call `subdomain.register` (RFC-0752) to create DNS record + Workers route. If registration fails, block the deploy.
5. **Execute `wrangler deploy`** — from the service directory, with `--secrets-file .env`.
6. **Health check** — for `publicEndpoints: true` services, fetch the `workersDevUrl` and expect HTTP 200 (or any non-5xx response). For services without public endpoints (e.g. cron workers), skip health check. Health check uses `workersDevUrl`, not the custom domain — DNS propagation does not block the deploy.
7. **Record state** — update `lastDeployed` in the registry with timestamp, state, and operation ID.
8. **Return result** — structured JSON with deploy and health state.

### service.registry.validate

1. **Parse `systems/registry.yaml`** — extract the `services:` key.
2. **For each service entry**: validate `id`, `workerName`, `url`, `kind`, `hostedBy` are present and non-empty.
3. **Cross-check** with `services/<id>/service.config.yaml` — ensure `id`, `kind`, and `routes` match.
4. **Check for duplicates** — no two entries with the same `id` or `workerName`.
5. **Validate `workerName === id`** — naming consistency.

### service.naming.validate

1. **For each `services:` entry** in registry:
   - `workerName` must equal `id`.
   - `services/<id>/wrangler.jsonc` `name` must equal `id`.
   - `services/<id>/service.config.yaml` `id` must equal `id`.
   - `services/<id>/package.json` `name` must equal `id` (or `@warpgogol/<id>`).
   - Directory `services/<id>/` must exist.
2. **Report violations** as errors.
3. **Integrated into `services.check.run`** alongside existing service import rules.

### Registry placement

The `services:` key is added to the existing `systems/registry.yaml` alongside the existing Sternsystem entries. This keeps all deployment state in one file and avoids a second registry file. If the registry grows too large, a split into `services/registry.yaml` can be done later without breaking consumers (the read function abstracts the location).

### `cloudflareZoneId` in `systems[]` entries

Each `systems[]` entry gains `cloudflareZoneId: <id>` for the Cloudflare zone of the client domain. This is used by RFC-0752 (`subdomain.register`, `subdomain.validate`) to make Cloudflare API calls for DNS records and Workers routes. The zone ID is stable (does not change after zone creation) and safe to store in version control — it is not a secret.

## Rollout

- **Default behavior**: `leitstand.service.deploy` is available immediately for all `services/*` with a registry entry.
- **Existing services**: `rate-fetcher-worker`, `lagebild-sync-worker`, `telegram-alert-bridge`, `matomo-proxy`, `cf-analytics-poller`, `fleet-probe-runner`, `check-warpgogol-runner`, and `observability-stack` are registered in the registry.
- **Worker renaming**: Existing `gogol-*` and `warpgogol-*` Workers are renamed to bare names. `wrangler deploy` with the new `name` creates a new Worker; the old Worker is deleted manually or via `wrangler delete`.
- **Existing per-service `deploy` scripts** remain as a fallback — they are not removed. `leitstand.service.deploy` is the preferred entry point.
- **New services**: Must be registered in `systems/registry.yaml` to be deployable via leitstand. The `service.config.yaml` file (already required) is the source of truth for `kind` and `routes`.

## Alternatives considered

- **Per-service deploy scripts only (status quo)**: Rejected — no state tracking, no centralized command, no health verification, no naming enforcement.
- **Separate `services/registry.yaml`**: Rejected for now — keeps everything in one file, simpler to maintain. Can be split later if needed.
- **Full channel model (dev/alt/main) for services**: Rejected as over-engineering — services are Workers with a single production endpoint. Multi-channel can be added later if needed.
- **Axiom evidence gate for services**: Rejected — services have no visitor-facing HTML to audit. Health check (HTTP probe) is sufficient.
- **Client-prefixed Worker names (`gogol-*`, `warpgogol-*`)**: Rejected — services are shared infrastructure, not per-client. Bare names enforce this convention.

## Risks

- **Registry drift**: If `systems/registry.yaml` service entries drift from `service.config.yaml`, deploys may use stale config. Mitigated by `service.registry.validate` cross-checking.
- **Health check false negatives**: A Worker may be healthy but return non-200 for its root URL (e.g. matomo-proxy returns 404 for `/`). Mitigated by allowing configurable health check paths.
- **Worker renaming disruption**: Renaming `gogol-rate-fetcher` → `rate-fetcher` creates a new Worker. The old Worker continues running until deleted. During the transition, both Workers exist. Mitigated by: deploy new name first, verify, then delete old Worker.
- **Dependency on RFC-0752**: `leitstand.service.deploy` depends on `subdomain.validate` and `subdomain.register` from RFC-0752. If RFC-0752 is not yet implemented, `leitstand.service.deploy` must gracefully skip subdomain validation (with a warning) or fail with a clear message.

## Acceptance criteria

- [ ] `leitstand.service.deploy` command registered in the kernel command table
- [ ] `service.registry.validate` command registered in the kernel command table
- [ ] `service.naming.validate` command registered in the kernel command table
- [ ] `systems/registry.yaml` has a `services:` key with entries for all existing services
- [ ] `systems/registry.yaml` `systems[]` entries have `cloudflareZoneId` field
- [ ] All Worker names in `wrangler.jsonc` match service IDs (no `gogol-*` or `warpgogol-*` prefixes)
- [ ] `leitstand.service.deploy --service matomo-proxy` successfully deploys the matomo-proxy Worker
- [ ] Deployment state is recorded in the registry after deploy
- [ ] `service.registry.validate` passes on the initial registry
- [ ] `service.naming.validate` passes on all services
- [ ] `service.naming.validate` is integrated into `services.check.run`
- [ ] `AGENTS.md` updated with service deployment protocol documentation
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The `leitstand.service.deploy` command lives in `packages/os/site-kernel-handoff/src/leitstand/` alongside existing leitstand commands.
- The service registry read/write functions live alongside the existing `readRegistry`/`writeRegistry` in `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts`.
- The `service.registry.validate` and `service.naming.validate` commands live in `packages/os/site-kernel-checks/src/`.
- **Implementation order**: RFC-0752 (Subdomain Management) should be implemented before or alongside this RFC, because `leitstand.service.deploy` depends on `subdomain.validate` and `subdomain.register`.
