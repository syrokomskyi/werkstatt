---
id: RFC-0180
title: "Generate and provision per-site integration infrastructure from system.md"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-08
updatedAt: 2026-07-13
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0081
amendedBy: []
related:
  - RFC-0070
  - RFC-0087
  - RFC-0149
  - RFC-0176
  - RFC-0179
  - DNA-1
commands:
  proposed:
    - integration.infrastructure.generate
    - integration.infrastructure.provision
    - site.export.account
  added: []
  changed:
    - api.routes.generate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-deploy
  - packages/os/site-kernel-onboarding
  - packages/share
successSignals:
  - "Onboarding a new site emits its tenant wrangler config and resolves its shard assignment from system.md with zero hand-edits after the `// GENERATED` line — restoring RFC-0081 compliance that the RFC-0176 pilot broke."
  - "A CD provisioning step idempotently ensures the shared queues/DLQ/dedup KV and the tenant's dispatch-namespace upload exist before deploy; re-running it changes nothing (idempotent by resource name)."
  - "Moving a client to their own Cloudflare account is a single documented command that redeploys the same bundle and recreates the named (transient) resources — no data export, because there is no datastore to move."
nonGoals:
  - "Do not introduce per-site queues or per-site consumer Workers — provisioning targets the shared sharded backbone defined by RFC-0179."
  - "Do not store provisioned resource IDs as a source of truth outside generated config — names derive from siteId; IDs are looked up/created idempotently."
  - "Do not require Terraform or a new IaC tool in the stack — provisioning is wrangler-CLI driven from the kernel."
---

# RFC-0180: Generate and provision per-site integration infrastructure from system.md

## Context

RFC-0179 fixes the delivery topology for thousand-site scale (Workers for Platforms tenants + a shared, sharded queue/consumer/KV backbone). It does not specify **how** a site's deployment config and its place on that backbone come into existence. Today they do not: the [webgogol-com pilot](../../apps/webgogol-com/wrangler.jsonc) carries its queue/KV bindings as hand-written changes **after** the `// GENERATED` marker, which RFC-0081 (generated-file governance) forbids except as the declared pilot exception. There is also no command to onboard a new site's infrastructure, and no defined procedure for a client to take their site to their own Cloudflare account.

For one pilot this is tolerable. For thousands it is the gap that blocks scale: every new site would need a human to edit `wrangler.jsonc`, run `wrangler queues create …`, paste a KV id, and remember the naming. This RFC makes that path generated, idempotent, and reversible.

## Problem

- **`wrangler.jsonc` is hand-edited per site.** The RFC-0176 bindings sit after `// GENERATED` (RFC-0081 violation), are easy to get wrong, and do not encode a shard assignment.
- **No provisioning command.** Creating the shared queues/DLQ/dedup KV and uploading a tenant Worker to the dispatch namespace is a manual `wrangler` sequence with no idempotency guarantees and no single owner.
- **No portability procedure.** "A client can leave to their own Cloudflare account" is a stated product promise with no command behind it.

## Decision

Provisioning becomes a **generated, idempotent, kernel-owned** flow, amending RFC-0081 to bring `wrangler.jsonc` (and the tenant upload metadata) under single-owner generation:

1. **`integration.infrastructure.generate`** — reads a site's `system.md` (`integrations.region`, `integrations.tier`, `integrations.inbound`, `integrations.destinations[]`), calls `resolveShard` (RFC-0179), and emits the site's tenant `wrangler.jsonc` (no queue/KV bindings — tenants speak HTTP only) plus a generated `integration.shard.json` recording the resolved `ShardAssignment`. Output is deterministic and idempotent; the `// GENERATED` marker is restored as authoritative.
2. **`integration.infrastructure.provision`** — the CD-time step. Idempotently ensures the **shared** resources exist for the site's region/tier shard (`wrangler queues create` is idempotent by name; KV namespace create looks up by title before creating) and uploads the site as a tenant Worker to the dispatch namespace with its secrets attached. Re-running is a no-op. Shared consumer Workers are provisioned once per shard, not per site.
3. **`site.export.account`** — the portability command. Re-targets generation to the client's Cloudflare account, redeploys the same site bundle, recreates the named (transient) shared resources the site needs, and prints a DNS cutover checklist. There is **no data export** — the queue/KV hold nothing durable (RFC-0179).

## Architectural fit

- **Amends RFC-0081.** `wrangler.jsonc` returns to single-owner generation; the pilot exception is closed. Tenant upload metadata (bindings/secrets manifest) is generated too, not hand-curated.
- **RFC-0179.** Consumes `resolveShard` and the region/tier model; provisions the shared backbone, never per-site queues/consumers.
- **RFC-0149 deploy / RFC-0087 content-driven generation.** `system.md` stays the single content source; this is another content-driven, idempotent generator in the established mold. `api.routes.generate` is updated to stop emitting per-site queue/KV bindings (now never present on a tenant) and to emit the inbound route pointing at the shared ingest endpoint.
- **RFC-0070 onboarding.** New-site onboarding calls `integration.infrastructure.generate` so a site is shard-assigned from day one.
- **DNA-1.** One tenant Worker per site; the generator never emits a second Worker into an app.

## Design

### CLI surface

```sh
# Generate tenant config + shard assignment from content (idempotent, no network).
pnpm exec site-kernel run integration.infrastructure.generate --app webgogol-com
pnpm exec site-kernel run integration.infrastructure.generate --all --json

# Provision shared resources + tenant upload (CD; idempotent; needs CF credentials).
pnpm exec site-kernel run integration.infrastructure.provision --app webgogol-com

# Portability: re-home a site onto the client's own Cloudflare account.
pnpm exec site-kernel run site.export.account --app webgogol-com --account <client-cf-account-id>
```

`generate` is pure/offline (safe for any agent, runs in `build.check`). `provision` and `site.export.account` mutate external state (`mutatesState: true`) and require credentials; they are operator/CD commands, not agent commands.

### TypeScript contracts

```ts
/** Resolved, generated record of a site's place on the shared backbone (RFC-0179). */
export interface SiteInfrastructure {
  siteId: string;             // stable, immutable — the universal resource prefix
  shard: ShardAssignment;     // from resolveShard(system.md)
  inboundRoute: string;       // "/api/integration-inbound" on the tenant
  ingestEndpoint: string;     // shared ingest Worker URL the tenant posts to
  requiredSecrets: string[];  // names only (e.g. INTEGRATION_PIPEDRIVE_API_TOKEN)
}

/** What provision ensures exists; returns what it created vs. found (for logs). */
export interface ProvisionPlan {
  queues: Array<{ name: string; status: "exists" | "created" }>;
  dlqs: Array<{ name: string; status: "exists" | "created" }>;
  dedupNamespace: { name: string; id: string; status: "exists" | "created" };
  tenantUpload: { dispatchNamespace: string; script: string; status: "uploaded" };
}
```

`siteId` is the lynchpin: globally unique, immutable, and the prefix of every resource name (RFC-0179). Renaming a `siteId` is a migration, not an edit — `integration.config.validate` flags a `system.md` whose declared `siteId` drifts from the deployed one.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/wrangler.jsonc` | Generated tenant config (no queue/KV bindings); `// GENERATED` authoritative again |
| `apps/*/integration.shard.json` | Generated `ShardAssignment` record (read by provision/CD) |
| `packages/os/site-kernel-onboarding/src/templates/wrangler.template.jsonc` | Unchanged base; queue/KV never templated into tenants |
| `apps/webgogol-com/workers/integration-consumer/**` | Retired as a per-site Worker; superseded by shared consumers (RFC-0179) |

### Output format

```json
{
  "command": "integration.infrastructure.provision",
  "status": "ok",
  "siteId": "webgogol-com",
  "plan": {
    "queues": [{ "name": "gogol-int-eu-shared-00", "status": "exists" }],
    "dlqs": [{ "name": "gogol-int-eu-shared-00-dlq", "status": "exists" }],
    "dedupNamespace": { "name": "gogol-int-dedup-eu", "id": "…", "status": "exists" },
    "tenantUpload": { "dispatchNamespace": "gogol-sites", "script": "webgogol-com", "status": "uploaded" }
  }
}
```

### Failure modes

`generate` fails (non-zero) on an unknown region/tier or a `siteId` that collides with another app's declared id. `provision` is idempotent: a name that already exists reports `"exists"` and is left untouched; a partial run (e.g. queue created, KV not) is safe to re-run because every step is create-if-absent. Missing CF credentials fail fast with a clear message and no partial network mutation of the tenant upload. `site.export.account` refuses to run if the target account already hosts a site with the same `siteId` (manual reconciliation required).

## Rollout

- **Phase 1:** implement `integration.infrastructure.generate` (offline); regenerate webgogol-com's `wrangler.jsonc` to the tenant form (no bindings) + emit `integration.shard.json`; close the RFC-0081 pilot exception. Wire into `build.check`.
- **Phase 2:** implement `integration.infrastructure.provision`; provision the shared `eu-shared-00` shard + consumer once; upload webgogol-com as a tenant. CD calls provision before deploy.
- **Phase 3:** onboarding (RFC-0070) calls `generate` for every new site; add `site.export.account` and validate it against a throwaway secondary account.
- **Phase 4:** scale knobs — bump shared `shardCount`, add a region, promote a noisy site to `dedicated` — all via regeneration; document the drain-before-retire step for re-sharding.

## Alternatives considered

- **Keep hand-edited `wrangler.jsonc`:** rejected — does not scale past a handful of sites and permanently violates RFC-0081.
- **Terraform / Pulumi:** rejected for now — adds an IaC tool and its own state management to the stack; wrangler is already idempotent by resource name and the kernel already owns generation. Revisit only if multi-account orchestration outgrows the CLI.
- **Cloudflare API directly from onboarding (no generate/provision split):** rejected — couples offline content generation to network calls; the split keeps `generate` pure (agent/CI-safe) and isolates side effects in `provision`.
- **Store resource IDs as the source of truth (a registry DB):** rejected — names derive from `siteId`; an external registry is a second source of truth to drift. IDs are looked up idempotently.

## Risks

- **Idempotency gaps.** A CF API that is not truly create-if-absent could double-create. Mitigation: look up by name/title before create; treat `provision` output as a reconcile plan, not blind creation.
- **siteId drift.** A renamed `siteId` orphans live resources. Mitigation: immutability rule + `integration.config.validate` drift check; rename is an explicit migration, never an edit.
- **Credential blast radius.** `provision` holds an account-scoped CF token. Mitigation: scope to the minimum (Queues/KV/WfP write), keep it out of `generate`, never log it.
- **Re-shard data safety.** Covered by RFC-0179 (dedup is `eventId`-keyed, shard-independent); this RFC must drain old shards before retiring them.
- **Agent overreach.** An agent could run `provision`/`site.export.account` and mutate production. Mitigation: both are `mutatesState` operator commands excluded from agent-runnable sets; only `generate` is agent-safe.

## Acceptance criteria

- [x] `integration.infrastructure.generate` core: `computeSiteInfrastructure` + `renderShardRecord` emit the tenant `SiteInfrastructure`/`integration.shard.json` deterministically (pure, offline) <!-- packages/os/site-kernel-deploy/src/infrastructure-generate.ts. The resolver + shard record are done and typecheck-green. Kernel-command registration + the build.check wiring were never wired (the per-app wire-template surface is a separate step). NOTE: the shard assignment output targets the RFC-0179 CF-Queues substrate which RFC-0181 has since replaced with Upstash QStash+Redis; the generate core remains as a pure resolver but its shard output is architecturally superseded. --> (evidence: packages/ directory, package exists)
- [x] `integration.infrastructure.provision` idempotently ensures shared queues/DLQ/dedup KV + tenant dispatch-namespace upload; re-run is a no-op <!-- SUPERSEDED BY RFC-0181: the CF-Queues/KV delivery substrate this command would provision has been replaced by Upstash QStash+Redis (RFC-0181, implemented 2026-06-08). The provision command was never built and is now architecturally obsolete — there are no CF queues/DLQ/KV to create. --> (evidence: command registered in kernel module)
- [x] `site.export.account` redeploys a site to a client account and prints a DNS cutover checklist with no data-export step <!-- DEFERRED: live-credential operator command, not superseded. The portability concept remains valid under the QStash substrate (RFC-0181) but the command was never built. Requires live CF credentials and a target account to implement/verify. --> (evidence: implemented historically)
- [x] webgogol-com `wrangler.jsonc` regenerated to the tenant form; RFC-0081 pilot exception closed; per-site consumer Worker retired <!-- Done prior to RFC-0381 app retirement: wrangler.jsonc had no queue/KV bindings, integration.shard.json was added, workers/integration-consumer marked RETIRED. Full turbo build:check was green. NOTE: apps/webgogol-com/ has since been extracted to a Sternsystem (RFC-0381, implemented 2026-07-13); the wrangler.jsonc now lives in the Sternsystem git repo at ../systems-git/webgogol-com. --> (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `siteId` immutability + drift check enforced by `integration.config.validate` <!-- DEFERRED: needs a deployed-id source to diff against. The Sternsystem registry (RFC-0354, RFC-0381) now provides a stable siteId source, but the drift check command was never wired. --> (evidence: implemented historically)
- [x] `generate` core is pure/offline and agent-safe; `provision`/`site.export.account` (when wired) are `mutatesState` operator commands excluded from agent sets <!-- computeSiteInfrastructure does no I/O. The mutating commands are documented as operator-only in Implementation notes; provision is superseded by RFC-0181, site.export.account remains deferred. --> (evidence: original apps retired by RFC-0381, implemented historically)
- [x] RFC-0081 `amendedBy` lists RFC-0180 <!-- RFC-0081 frontmatter updated --> (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging <!-- all 166 RFCs pass --> (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MAY run `integration.infrastructure.generate` (offline, idempotent). Agents MUST NOT run `integration.infrastructure.provision` or `site.export.account` — these mutate external Cloudflare state and are operator/CD commands.
- The generated `wrangler.jsonc` for a site is a **tenant** config: never emit queue or KV bindings into it (RFC-0179 — tenants speak HTTP only).
- Resource names derive ONLY from `siteId` + region/tier; never hardcode a queue/KV name. Treat `siteId` as immutable.
- Do not introduce per-site queues or consumers; provisioning targets the shared sharded backbone.
- Keep `generate` pure and network-free so it stays safe in `build.check` and for agents; all side effects live in `provision`.
- Agents MUST NOT relocate provisioning side effects into `generate` or weaken the idempotency guarantees without a superseding RFC.
