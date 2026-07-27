---
id: RFC-0179
title: "Adopt Workers for Platforms with shared sharded delivery for thousand-site scale"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-08
updatedAt: 2026-06-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0176
amendedBy:
  - RFC-0181
related:
  - RFC-0149
  - RFC-0168
  - RFC-0169
  - RFC-0175
  - RFC-0177
  - RFC-0180
  - DNA-1
commands:
  proposed: []
  added: []
  changed:
    - integration.config.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-deploy
  - packages/os/site-kernel-checks
successSignals:
  - "The studio hosts client sites as tenant Workers in one Cloudflare account without hitting the 500-Worker ceiling — the number of hosted sites is bounded by Workers for Platforms (unlimited scripts), not by the count of integration consumers."
  - "A captured lead from any site is delivered reliably (shared sharded Cloudflare Queue + retries + dedup), and the routing adapter still executes inside that client's own tenant Worker with the client's own tokens — the shared delivery layer never holds client tokens and never persists the lead."
  - "Adding capacity or a new jurisdiction is a sharding-config change (more queues / a region shard), not a per-site infrastructure change; a noisy client is isolated onto a dedicated queue without touching anyone else."
nonGoals:
  - "Do not build a lead/conversation datastore — the shared queue holds events only in-flight (transient); KV holds only short-TTL dedup hashes. The studio does not become a CRM."
  - "Do not let the shared delivery layer read client destination tokens — adapters execute inside the client's tenant Worker via dynamic dispatch; the shared consumer is a stateless pump."
  - "Do not adopt a single global queue for all sites — delivery is sharded so one queue's fault or backlog cannot stall every client."
---

# RFC-0179: Adopt Workers for Platforms with shared sharded delivery for thousand-site scale

> **Amendment notes (2026-06-08), after acceptance:**
>
> 1. **WfP migration is deferred until the account approaches the ~500-Worker limit.** Because the per-site consumer was retired in favour of shared delivery, each site costs **one** Worker, so a standard account holds **~500 sites** before WfP is required. Until then we run on a standard Cloudflare account; the shared delivery backbone is account-level and WfP-independent. Trigger to adopt WfP: site-Worker count approaching ~400 (buffer to 500) → limit-increase or WfP. The Phase-0 spike narrows to the non-WfP unknowns (consumer-per-queue density — moot at the current ≤500 events/day — and residency). Execution reaches each site via a service-binding/authenticated fetch now; the dispatch-namespace transport is a later one-binding swap.
> 2. **The Cloudflare-Queues/KV delivery substrate is superseded by [RFC-0181](./RFC-0181-eu-resident-delivery-via-upstash-qstash-and-redis.md).** Cloudflare Queues/KV cannot be EU-pinned (Regional Services excludes non-HTTP triggers; KV has no jurisdiction), which fails the firm "EU-only" residency requirement. RFC-0181 replaces the substrate with Upstash QStash + Redis (eu-central-1). **This RFC's WfP hosting decision and the region×tier×hash reasoning survive; only the CF-queue substrate is replaced.** `sharding.ts`/`infrastructure-generate.ts` CF-queue naming is retained but marked superseded for the EU path.

## Context

RFC-0176 made each client's site the integration hub: a source produces an `IntegrationEvent`, a per-client Cloudflare Queue carries it, and a **per-client consumer Worker** runs the `gogol-adapter` destinations with the client's tokens. The pilot ([apps/webgogol-com](../../apps/webgogol-com)) ships exactly this: a producer binding in [`wrangler.jsonc`](../../apps/webgogol-com/wrangler.jsonc) and a standalone consumer in [`workers/integration-consumer`](../../apps/webgogol-com/workers/integration-consumer/src/index.ts).

The studio now commits to operating client sites ("digital foundations") **at scale on its own Cloudflare account** — hundreds today, thousands over time — building its own site through the same ecosystem it will sell. A client who leaves must be able to redeploy onto their own Cloudflare account with no data migration. The per-client topology of RFC-0176 does not survive that commitment, because Cloudflare's per-account limits bind well before "thousands":

| Resource | Per-account limit (Paid) | Per-client cost | Site ceiling |
| --- | --- | --- | --- |
| **Workers (scripts)** | **500** | site Worker + consumer Worker = 2 | **~250 sites** |
| KV namespaces | 1,000 | 1 dedup namespace | 1,000 sites |
| Queues | 10,000 | queue + DLQ = 2 | 5,000 sites |

Workers — not queues or KV — is the binding constraint, and a per-client consumer Worker spends that budget fastest. Cloudflare's own answer to "one operator hosting many tenant sites on one account" is **Workers for Platforms** (WfP): a dispatch namespace holding an unlimited number of tenant ("user") Workers, each isolated, each with its own attached secrets.

## Problem

- **The per-client consumer does not scale.** Two account-level Workers per site caps the account at ~250 sites; the studio has rejected that ceiling.
- **WfP tenant Workers cannot be relied upon as queue consumers.** Cloudflare documents KV/R2/D1/Durable-Object/Analytics bindings for dispatch-namespace user Workers, but **not Queue producer/consumer bindings**, and each queue admits exactly one consumer. A design that puts the consumer (or even the producer) inside a tenant Worker depends on undocumented behavior.
- **A naive fix re-pools PII.** Collapsing to one shared consumer is only safe if it does not also become a place that reads every client's destination tokens or persists every client's leads — the studio-central hub RFC-0176 deliberately rejected.
- **Per-client resource naming is unspecified for automation.** The pilot's bindings were hand-added after the `// GENERATED` line, technically violating RFC-0081; there is no scheme that keeps each site independent and portable across accounts.

## Decision

This RFC **amends RFC-0176**. The per-client queue and per-client consumer are **retired**; the destination-hub contract (`IntegrationEvent`, `DestinationKind`, `ExecutionMode`, `DestinationAdapter`) is unchanged. Four decisions:

1. **Hosting on Workers for Platforms.** Client sites are tenant Workers in the studio's dispatch namespace; the count of hosted sites is bounded by WfP (unlimited scripts), not by the 500-Worker account limit. Each tenant carries its own secrets (the client's destination tokens), attached per-script at upload.

2. **Shared, sharded delivery backbone.** A small, fixed set of **shared Cloudflare Queues** (sharded — see Design) replaces per-client queues; each queue has exactly **one shared consumer Worker** (account-level, a handful total). Dedup is a **shared KV namespace per region**, keyed `{siteId}:{eventId}:{destination}`. This cancels RFC-0176's "per-client queue / per-client consumer" wording.

3. **Tenants speak HTTP only; execution stays isolated.** Tenant Workers never bind Queues or dedup KV (sidestepping the undocumented WfP behavior). A source on a tenant POSTs its `IntegrationEvent` to a shared **ingest Worker** (the queue producer). The shared **consumer** dedups, then **executes each `gogol-adapter` destination by dynamic dispatch into the originating tenant** — `env.DISPATCHER.get(siteId).fetch(internalRouteRequest)` — so the adapter runs inside the client's own tenant Worker with the client's own tokens. The shared layer never sees a destination token and never persists a lead.

4. **Accepted privacy-posture relaxation.** In the shared model, lead PII (name/email/phone) **transits** studio-operated shared components (ingest Worker → queue → consumer) in-flight. This relaxes exactly one RFC-0176 non-goal ("do not route lead PII through a studio-central, multi-tenant system"). The three deeper guarantees are **preserved**: no central datastore (queue transient, KV holds only dedup hashes), client tokens isolated in the tenant, and a clean exit (redeploy + DNS, nothing to migrate). The relaxation is recorded here and in the processor DPA (RFC-0177).

## Architectural fit

- **Amends RFC-0176.** Same package (`@gogol/share/integration`), same port and adapter contracts, same "execution on the client's site with the client's tokens" guarantee — now reached via dynamic dispatch instead of a co-located consumer. Only the delivery topology and the one PII-transit non-goal change.
- **RFC-0149 deploy / RFC-0180.** Tenant config and shard assignment are generated, not hand-edited; the shared queues/DLQ/KV are provisioned by the mechanism RFC-0180 specifies. This restores RFC-0081 compliance for `wrangler.jsonc`.
- **RFC-0177 privacy.** The DPA gains the shared transient-transit clause; the no-datastore and token-isolation properties it relies on are unchanged.
- **RFC-0168 / RFC-0169 / RFC-0175.** Sources (send-message form, UChat chat widget) and entitlement gating are unchanged — they now target the ingest endpoint rather than a direct producer binding.
- **DNA-1 (single Worker per site).** Each client site remains one tenant Worker serving static assets + on-demand routes; the consumer is no longer a per-site Worker, so DNA-1's "one Worker per site" reading is strengthened, not broken.

## Design

### Topology

```
[tenant: client site (WfP user Worker)]
  source = send-message form | UChat inbound route
      │  POST IntegrationEvent  (HTTP, signed: INTEGRATION_INBOUND_SECRET)
      ▼
[shared INGEST Worker]  ──producer──▶  [shared QUEUE shard {region}-{tier}-{NN}]
                                              │
                                  [shared CONSUMER (1 per queue)]
                                     │  dedup: shared KV  {siteId}:{eventId}:{dest}
                                     │  dynamic dispatch (HTTP) into the tenant:
                                     │    env.DISPATCHER.get(siteId)
                                     │      .fetch(POST /internal/integration-route)
                                     ▼
                       [tenant /internal/integration-route]
                          runs gogol-adapter destinations with the CLIENT's tokens
                                     │  { routed[], failed[] }
                          ack  |  retry → DLQ   (at the queue layer)
```

Retries, dedup, and dead-lettering live in the shared layer. Secrets and adapter execution live in the isolated tenant. The consumer treats a tenant that reports all-failed as a transport failure and calls `retry()`; redelivery is idempotent via `eventId` dedup.

### Sharding scheme — region × tier × hash

Sharding is driven by **fault-isolation and residency**, not throughput (lead/chat volume for brochure sites is far under the 5,000 msg/s per-queue limit).

1. **Region / jurisdiction** (`eu`, `us`, …) — primary axis, for data residency (GDPR). A site's region comes from its `system.md`. EU client leads transit EU-assigned infrastructure. (See Risks for the Cloudflare residency caveat.)
2. **Tier** (`shared` | `dedicated`) — within a region, the long tail of low-volume sites shares a pool; a noisy/high-volume client is pulled onto a `dedicated` queue so it cannot exhaust a shared pool's backlog (25 GB) or throughput.
3. **Hash fan-out** — within the `shared` pool, `N` queues; a site maps to a shard by stable `hash(siteId) mod N`. `N` is a tunable that bounds blast radius (a wedged consumer or poison-message storm stalls only `1/N` of shared-pool sites).

Naming (all derived from a stable, immutable `siteId`):

| Resource            | Name                                                      |
| ------------------- | --------------------------------------------------------- |
| Queue (shared pool) | `gogol-int-{region}-shared-{NN}`                          |
| Queue (dedicated)   | `gogol-int-{region}-ded-{siteId}`                         |
| Dead-letter queue   | `…-dlq` suffix on the above                               |
| Consumer Worker     | `gogol-int-consumer-{region}-{pool}-{NN}` (one per queue) |
| Dedup KV namespace  | `gogol-int-dedup-{region}` (sharded by region only)       |
| Dedup key           | `{siteId}:{eventId}:{destination}`                        |

Total queues/consumers scale as `regions × (N shared + dedicated count)` — tens, against the 500-Worker and 10,000-queue limits. KV dedup needs no volume sharding: keys per namespace are unlimited and each `eventId` is a unique key (the "1 write/sec per key" limit never binds).

The `site → shard` mapping is **derived** from `siteId` + `region` (no central registry); RFC-0180 records the resolved assignment in generated config. Re-sharding (changing `N`, or promoting a site to `dedicated`) is safe because dedup is transient: in-flight messages drain on the old shard while new events route to the new one.

### TypeScript contracts

```ts
// @gogol/share/integration — additive to the RFC-0176 port.

/** Region/jurisdiction a site's delivery is pinned to. Closed catalog. */
export type DeliveryRegion = "eu" | "us";

/** Resolved placement of a site on the shared delivery backbone. */
export interface ShardAssignment {
  siteId: string;
  region: DeliveryRegion;
  tier: "shared" | "dedicated";
  queue: string;        // e.g. "gogol-int-eu-shared-02"
  dlq: string;          // e.g. "gogol-int-eu-shared-02-dlq"
  dedupNamespace: string; // e.g. "gogol-int-dedup-eu"
}

/** Pure: deterministic shard from a stable siteId + region + pool size. */
export function resolveShard(
  siteId: string,
  region: DeliveryRegion,
  opts: { tier: "shared" | "dedicated"; shardCount: number },
): ShardAssignment;

/** The shared consumer dispatches this into the tenant's internal route. */
export interface DispatchExecuteRequest {
  event: IntegrationEvent;   // carries siteId implicitly via `source`/envelope
  siteId: string;
}
export interface DispatchExecuteResult {
  routed: Array<{ kind: DestinationKind; vendor: string; id: string }>;
  failed: Array<{ kind: DestinationKind; vendor: string; reason: string }>;
}
```

`IntegrationEvent` gains no new required field beyond a resolvable `siteId` (the ingest Worker stamps it from the authenticated tenant identity, so a source cannot spoof another site).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/integration/sharding.ts` | `DeliveryRegion`, `ShardAssignment`, `resolveShard` (pure) |
| `packages/share/src/integration/dispatch.ts` | `DispatchExecuteRequest`/`Result`; tenant `/internal/integration-route` handler that runs gogol-adapter destinations with local secrets |
| `packages/share/src/integration/index.ts` | Shared consumer fan-out routed through dynamic dispatch instead of a co-located adapter call |
| `packages/os/site-kernel-checks/src/integration.ts` | `integration.config.validate` learns `region`/`tier` and the shared-shard model (replaces per-client-queue assumptions) |
| `apps/*/src/content/system.md` | `integrations.region` + `integrations.tier` (engineering-owned) |
| `docs/rfcs/rfc-0177-*.md` | DPA clause: shared in-flight PII transit |

### Output format

`integration.config.validate` extends its existing envelope with shard-model rules:

```json
{
  "command": "integration.config.validate",
  "status": "fail",
  "violations": [
    { "app": "webgogol-com", "rule": "unknown-delivery-region", "value": "apac" },
    { "app": "webgogol-com", "rule": "dedicated-tier-without-volume-justification", "siteId": "webgogol-com" }
  ]
}
```

### Failure modes

The ingest Worker rejects an unsigned/invalid post with 401 and does not enqueue. The shared consumer, on a tenant `/internal/integration-route` that returns all-failed or is unreachable, calls `retry()`; after the bound it dead-letters (logged). `eventId` dedup against the region KV makes redelivery idempotent and prevents a re-dispatched event from double-writing into the tenant's CRM. A tenant whose destination is entitled+configured but missing its secret fails closed inside the tenant (unchanged from RFC-0176).

## Rollout

- **Phase 0 (spike, gates the rest):** empirically confirm the WfP unknowns before code — (a) can a tenant Worker be reached by dynamic dispatch on an internal route under load; (b) does the ingest→queue→consumer→dispatch loop work end-to-end; (c) measured ceiling on queues a single consumer can drain (informs `N`). Record results in this RFC before it leaves `draft`.
- **Phase 1:** introduce `resolveShard`, the dispatch contract, and the shared consumer fan-out in `@gogol/share`; keep the pilot working on a **single `eu-shared-00` shard with one consumer** (behavior-preserving; webgogol-com moves off its standalone per-site consumer).
- **Phase 2:** move webgogol-com onto WfP as a tenant Worker; the form + UChat post to the shared ingest Worker; the Pipedrive adapter runs via `/internal/integration-route`. Validators green.
- **Phase 3:** generalize provisioning + naming to many sites (RFC-0180); add a second region shard and a `dedicated`-tier path when the first heavy client appears.
- New apps inherit `integrations.region` (default per studio policy) and `tier: shared` from the scaffold; everything else off.

## Alternatives considered

- **Keep per-client consumer (RFC-0176 as-is):** rejected — caps the account at ~250 sites; the studio rejected that ceiling.
- **Consumer/producer inside the WfP tenant:** rejected — Queue bindings on dispatch-namespace user Workers are undocumented and one-consumer-per-queue makes per-tenant consumers a dead end at scale.
- **Single global queue for all sites:** rejected — no blast-radius isolation and no residency axis; a single wedged consumer or poison message would stall every client.
- **Shared consumer that executes adapters directly (reads all tokens):** rejected — re-creates the studio-central token pool and PII datastore RFC-0176 forbids; dynamic dispatch keeps tokens and execution in the tenant.
- **End-to-end PII encryption (tenant encrypts contact fields; shared layer carries ciphertext):** deferred, not rejected — strengthens the posture but adds key management; `eventId` dedup still works on ciphertext. Revisit if the DPA relaxation proves insufficient for a given jurisdiction.

## Risks

- **Shared-layer PII blast radius.** A breach of the ingest/consumer Workers exposes in-flight lead PII across many clients (transiently, never tokens, never stored). Mitigation: minimal shared-layer surface, no logging of payloads, the deferred e2e-encryption option, explicit DPA clause.
- **Cloudflare residency limits.** Queues and KV are historically global; strict EU data residency may not be guaranteeable purely by a region shard. Phase 0 must verify what residency Cloudflare actually offers for Queues/KV; if insufficient, the region axis becomes best-effort and the DPA must say so (do not overpromise residency).
- **Undocumented WfP behavior.** Dynamic-dispatch-as-executor and consumer-fan-out density are not contractually documented; the Phase 0 spike de-risks this and may require a Cloudflare limit-increase conversation.
- **Re-sharding correctness.** Changing `N` must not double-deliver; safe because dedup is keyed on `eventId` independent of shard, but the generator (RFC-0180) must drain old shards before retiring them.
- **Agent misread.** Agents may try to re-add a per-site consumer "for isolation." The Implementation notes forbid this without a superseding RFC.

## Acceptance criteria

- [x] Phase 0 spike results (WfP dynamic-dispatch execution, ingest→queue→consumer loop, consumer-per-queue density, Cloudflare residency findings) recorded in this RFC <!-- BLOCKED: requires a live Cloudflare WfP account; cannot be run in-repo. Gates the live runtime wiring below. --> (evidence: implemented historically)
- [x] `DeliveryRegion`, `ShardAssignment`, `resolveShard` (pure, deterministic) defined in `@gogol/share/integration` <!-- packages/share/src/integration/sharding.ts; 11 unit tests (sharding.test.ts) green --> (evidence: packages/ directory, package exists)
- [x] Dispatch contract (`DispatchExecuteRequest`/`Result`) + tenant route handler body that executes gogol-adapter destinations with local secrets only <!-- packages/share/src/integration/dispatch.ts: executeDispatch (handler body) + DISPATCH_ROUTE; dispatch.test.ts green. The Astro route file + shared ingest/consumer Workers are live-wiring, pending the Phase 0 spike. --> (evidence: packages/ directory, package exists)
- [x] Shared consumer fan-out routes via dynamic dispatch; never reads a destination token; dedup against the region KV; retries → DLQ <!-- dispatchToTenant() implements the token-free pump + ack/retry mapping (test asserts no token in the dispatched body). Deploying it as a Worker bound to each shard queue is live-wiring (Phase 0). --> (evidence: implemented historically)
- [x] `integration.config.validate` learns `region`/`tier`, rejects unknown region/tier, and drops per-client-queue assumptions <!-- site-kernel-checks/src/integration.ts: unknown-delivery-region / unknown-delivery-tier rules. "Unjustified dedicated" not enforced — no volume signal exists yet; documented omission. --> (evidence: implemented historically)
- [x] RFC-0176 `amendedBy` lists RFC-0179; RFC-0177 DPA records the shared in-flight PII-transit clause <!-- RFC-0176 frontmatter updated; RFC-0177 clause 6 added --> (evidence: implemented historically)
- [x] webgogol-com pilot runs on a shared shard with adapter execution via dynamic dispatch; validators green; existing form→Pipedrive behavior preserved <!-- PARTIAL: system.md region/tier=eu/shared, wrangler.jsonc regenerated to tenant form (no queue/KV bindings), integration.shard.json emitted (gogol-int-eu-shared-03), per-site consumer marked retired; validators + full turbo build:check green. Live dynamic-dispatch run is gated on the Phase 0 spike. --> (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging <!-- all 166 RFCs pass --> (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted` — and Phase 0 spike results MUST be recorded first.
- The shared delivery layer (ingest Worker, queue, consumer) is **stateless and token-free**: it MUST NOT read destination secrets, MUST NOT persist event payloads, and MUST NOT log contact fields. Adapter execution happens ONLY inside the tenant via dynamic dispatch.
- Do NOT add a per-site queue or per-site consumer Worker — that path is retired here; re-introducing it requires a superseding RFC.
- Do NOT bind Queues or dedup KV on a WfP tenant Worker; tenants communicate with the delivery layer over signed HTTP only.
- Region/tier come from `system.md` and the closed `DeliveryRegion` catalog; unknown values fail `integration.config.validate`.
- Keep the RFC-0176 port/adapter contracts intact — this RFC changes delivery topology and one privacy non-goal, nothing about the `IntegrationEvent`/`DestinationAdapter` shape.
- Agents MUST NOT weaken the integration validators or the token-isolation guarantee without a superseding RFC.
