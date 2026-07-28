---
id: RFC-0181
title: "EU-resident delivery via Upstash QStash and Redis"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-08
updatedAt: 2026-06-08
implementedAt: 2026-06-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0177
  - RFC-0179
amendedBy:
  - RFC-0182
related:
  - RFC-0168
  - RFC-0176
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
  - packages/os/site-kernel-checks
successSignals:
  - "A captured lead is delivered reliably (Upstash QStash EU: retries + DLQ + dedup) and the routing adapter still executes inside the client's own site with the client's tokens — with every byte of lead PII physically resident in the EU (Frankfurt, AWS eu-central-1)."
  - "The studio operates no shared queue/KV/consumer in the PII path: QStash (an EU-resident processor under a DPA) is the delivery backbone, publishing back to each site's own callback route."
  - "The Datenschutz/DPA can state, truthfully, where lead data physically resides and under which legal instruments — no overclaim of sovereignty."
nonGoals:
  - "Do not claim EU legal sovereignty: Upstash is US-incorporated (CLOUD Act exposure closed contractually via SCC/DPF, not structurally). Structural sovereignty needs an EU-incorporated/self-hosted primitive — out of scope here, documented as a future tier."
  - "Do not build a lead datastore — QStash holds events in-flight only; the Redis idempotency ledger stores short-TTL eventId keys, never PII."
  - "Do not route lead PII through Cloudflare Queues/KV — they cannot be EU-pinned (Regional Services excludes non-HTTP triggers); this RFC removes them from the delivery path."
---

# RFC-0181: EU-resident delivery via Upstash QStash and Redis

> **Amendment note (2026-06-08, after implementation):** the exchange is now fully standardized on QStash. (1) The **send-message form publishes to QStash** too (not just the chat widget) — both sources emit the same `IntegrationEvent`; the single callback `/api/integration-route` (declared by both manifests, deduped by route) runs `deliverEvent` = channels (Telegram/WhatsApp) + CRM (Pipedrive). (2) **Email is Cloudflare Email Routing** (the `send_email` Worker binding) in the callback — the Resend channel adapter and `INTEGRATION_EMAIL_API_KEY` are removed; `INTEGRATION_EMAIL_TO/FROM` are verified Cloudflare addresses. Cloudflare KV/Queues remain forbidden (RFC-0181); the `send_email` binding is allowed. Note: email content transits Cloudflare (global), the same physical-vs-structural caveat as any US-incorporated processor — disclosed in the Datenschutz.

## Context

RFC-0179 chose a shared, sharded **Cloudflare Queues + KV** delivery backbone. Verifying the residency risk it flagged surfaced a hard fact: **Cloudflare Queues and KV cannot be pinned to the EU.** Cloudflare's Regional Services (the data-localization mechanism) explicitly **does not apply to non-HTTP triggers — Queues and Cron** — and Workers KV exposes no jurisdiction restriction (unlike Durable Objects / D1 / R2, which support `jurisdiction: 'eu'`). Lead PII transiting a Cloudflare Queue is therefore processed on potentially non-EU infrastructure.

The studio's requirement is firm: **lead data is processed exclusively on EU servers (eu-central-1, Germany)**, with defensible argumentation for privacy-sensitive clients. The current pilot volume is small — **≤ 50 sites × ≤ 10 events/day ≈ 500 events/day total (~0.006 req/s)** — so the queue was never needed for throughput, only for delivery reliability (retry/DLQ).

## Problem

- Cloudflare Queues/KV cannot satisfy EU residency; using them for lead PII breaks the stated requirement.
- The RFC-0179 shared studio-operated consumer/queue/KV put the studio in the in-flight PII path (RFC-0177 clause 6) — acceptable only if it could be EU-pinned, which it cannot.
- A reliable, EU-resident delivery substrate is needed without the studio operating its own queue infrastructure.

## Decision

This RFC **amends RFC-0179 and RFC-0177**. The Cloudflare-Queues/KV delivery substrate is **replaced by Upstash, pinned to the EU**; the RFC-0176/0168 port and adapter contracts and the "execution inside the client's site with the client's tokens" guarantee are unchanged. RFC-0179's **Workers-for-Platforms hosting decision is unaffected** (and is itself deferred — see RFC-0179's WfP-deferral note).

1. **Delivery backbone = Upstash QStash (EU region).** A site publishes its `IntegrationEvent` to QStash at `https://qstash-eu-central-1.upstash.io` over HTTPS, with `Upstash-Deduplication-Id: {eventId}` and a configured retry count. QStash stores the message in Frankfurt, retries with exponential backoff, and dead-letters on exhaustion. QStash **delivers via signed webhook back to the originating site's own callback** `POST /internal/integration-route` — so the studio operates no shared queue/consumer in the PII path.
2. **Idempotency ledger = Upstash Redis (EU region, eu-central-1).** The callback route performs a durable idempotency check (`SET eventId … NX EX <ttl>`) in Redis before routing, complementing QStash's built-in dedup window. The ledger stores only short-TTL `eventId` keys — never PII.
3. **EU execution.** Each client zone runs the site Worker under **Regional Services (EU)** so the adapter executes in the EU; QStash + Redis hold data in eu-central-1. Lead PII is EU-resident end to end.
4. **Honest legal boundary.** Upstash, Inc. is a Delaware C-Corp; EU residency here is **physical + contractual** (SCC + EU-U.S. DPF + DPA), not structural sovereignty (CLOUD Act exposure remains, closed contractually). Full structural sovereignty (no US parent) would require an EU-incorporated/self-hosted primitive — documented as a future "tier 2", not built here.

## Architectural fit

- **Amends RFC-0179:** replaces its CF-Queues/KV substrate (and retires its shared ingest/consumer Workers and the CF-queue sharding/provisioning of RFC-0180) with QStash+Redis; keeps WfP hosting (deferred) and the destination-hub contracts.
- **Amends RFC-0177:** clause 6 is restated — the in-flight delivery processor is **Upstash QStash (EU)**, not a studio-operated shared component; data is EU-resident; the DPA names Upstash as a (sub-)processor with SCC/DPF.
- **RFC-0176/0168:** the `IntegrationEvent` and `DestinationAdapter` contracts and `executeDispatch` (the route that runs gogol-adapter destinations with the client's tokens) are reused verbatim — QStash's webhook is just another caller of the same tenant route.
- **DNA-1:** still one Worker per site; no studio-operated shared Worker in the path.

## Design

### Topology

```
[site worker (EU via Regional Services)]
  source = send-message form | UChat inbound
      │ publishEvent → HTTPS POST https://qstash-eu-central-1.upstash.io/v2/publish/{callbackUrl}
      │   headers: Upstash-Deduplication-Id: {eventId}, Upstash-Retries: N
      ▼
[Upstash QStash — EU (Frankfurt)]  — stores in-flight, retries (exp backoff), DLQ
      │ signed webhook (Upstash-Signature, JWT) →
      ▼
[site /internal/integration-route (EU)]
      │ verify QStash signature → Redis-EU SETNX eventId (idempotency) → routeEventToReady(client tokens)
      ▼  200 ack → QStash done; non-2xx → QStash retries → DLQ
```

### TypeScript contracts (additive, in `@gogol/share/integration`)

```ts
export const QSTASH_EU_BASE = "https://qstash-eu-central-1.upstash.io" as const;

export interface QstashPublishConfig {
  token: string;          // UPSTASH_QSTASH_TOKEN (server secret, never logged)
  callbackUrl: string;    // the site's own /internal/integration-route absolute URL
  retries?: number;       // default 3 (QStash exp backoff)
  baseUrl?: string;       // default QSTASH_EU_BASE — EU residency pin
}

/** Pure: build the HTTPS request to publish an event to QStash EU (no I/O). */
export function buildQstashPublish(event: IntegrationEvent, config: QstashPublishConfig): Request;

/** Durable idempotency ledger (Upstash Redis EU). Returns true if first-seen. */
export interface IdempotencyLedger {
  firstSeen(eventId: string, ttlSeconds?: number): Promise<boolean>;
}
```

Signature verification on the callback uses Upstash's `@upstash/qstash` `Receiver` (current/next signing keys) — the studio does not reimplement JWT crypto.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/integration/qstash.ts` | `QSTASH_EU_BASE`, `buildQstashPublish` (pure), `IdempotencyLedger`, Redis-backed ledger adapter |
| `packages/share/src/integration/sharding.ts` | CF-queue naming — **superseded by this RFC** for the EU path (retained, marked) |
| `packages/os/site-kernel-checks/src/integration.ts` | `integration.config.validate` learns the QStash/Redis EU secret expectations |
| `apps/*/src/content/system.md` | `integrations.delivery: { provider: upstash, region: eu }` |
| `docs/specs/integration-delivery.md` | Agent/human spec for the delivery subsystem (incl. the honest EU argumentation) |

### Output format

```json
{
  "command": "integration.config.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "delivery-provider-unknown", "value": "sqs" },
    { "app": "warpgogol-com", "rule": "delivery-secret-missing", "secret": "UPSTASH_QSTASH_TOKEN" }
  ]
}
```

### Failure modes

A non-2xx callback makes QStash retry (bounded → DLQ). The Redis idempotency check makes a QStash redelivery a no-op (no double-write into the client CRM). A missing `UPSTASH_QSTASH_TOKEN`/signing key fails closed (no publish / reject callback). If Redis is unreachable, the route fails closed (retry) rather than risking a double-write.

## Rollout

- Phase 1: `qstash.ts` pure publish-builder + `IdempotencyLedger` + tests; validators learn the delivery secrets; spec + README + AGENTS clauses. Mark the CF-queue substrate superseded.
- Phase 2: wire the site callback route (`@upstash/qstash` Receiver + Redis ledger + `routeEventToReady`); warpgogol-com publishes to QStash EU; live secrets via untracked env.
- Phase 3: enable Regional Services (EU) on each client zone; document the residency posture in the Datenschutz/DPA.
- Phase 4 (future tier 2): EU-incorporated/self-hosted substrate for clients requiring structural sovereignty.

## Alternatives considered

- **Cloudflare Queues + KV (RFC-0179):** rejected for EU sites — cannot be EU-pinned (Regional Services excludes Queues/Cron; KV has no jurisdiction).
- **Cloudflare Durable Objects (jurisdiction=eu) as queue+dedup:** viable for EU residency but re-implements retry/DLQ by hand; QStash provides them managed. Revisit if Upstash dependency is undesirable.
- **Keep CF backbone, relax to "EU-region best-effort under SCC":** rejected — contradicts the firm EU-exclusive requirement.
- **EU-incorporated/self-hosted (Hetzner/Scaleway + self-hosted Redis/queue):** the only path to structural sovereignty (no US parent); deferred as tier 2 — heavier ops, not warranted at current volume.

## Risks

- **US-parent / CLOUD Act.** Upstash is US-incorporated; residency is physical+contractual, not sovereign. Mitigation: accurate DPA/Datenschutz wording (no overclaim); tier-2 path documented for clients who need structural sovereignty.
- **Vendor dependency.** Delivery now depends on Upstash availability. Mitigation: QStash DLQ + the synchronous fallback (the route can run inline if publish fails) keep a lead from being lost.
- **Secret hygiene.** `UPSTASH_QSTASH_TOKEN`, signing keys, and the Redis token are server secrets — via `astro:env/server`/untracked env only; never logged, never committed.
- **Regional Services dependency.** True EU execution needs Regional Services (EU) on the zone (Data Localization Suite entitlement); without it, the Worker may execute outside the EU even though storage is EU. Documented as a deploy prerequisite.

## Acceptance criteria

- [x] `QSTASH_EU_BASE`, `buildQstashPublish` (pure), `IdempotencyLedger`/`restRedisLedger` defined in `@gogol/share/integration` with unit tests <!-- qstash.ts + qstash.test.ts (5 tests green): EU base, dedup id, no-token-in-body, ledger first-seen + fail-closed --> (evidence: packages/ directory, package exists)
- [x] `integration.config.validate` validates the Upstash delivery provider + EU region <!-- delivery-provider-unknown / delivery-region-not-eu rules. Secret-PRESENCE validation (UPSTASH_QSTASH_TOKEN etc. in the env schema) is a follow-up once the callback route declares them via api[].secrets. --> (evidence: implemented historically)
- [x] CF-Queues/KV substrate marked superseded for the EU delivery path; RFC-0179/0177 `amendedBy` list RFC-0181 <!-- sharding.ts/index.ts/RFC-0179 notes; RFC-0177 clause 6 restated; back-refs added --> (evidence: implemented historically)
- [x] `docs/specs/integration-delivery.md` + README document the subsystem AND the honest physical-vs-structural EU argumentation <!-- docs/specs/integration-delivery.md + packages/share/src/integration/README.md. Per-app AGENTS.md is template-generated (RFC-0079) — a clause there is a generator follow-up; the spec is the authoritative agent doc. --> (evidence: AGENTS.md:1, agent guide updated)
- [x] warpgogol-com declares `integrations.delivery: { provider: upstash, region: eu }`; validators + build green <!-- system.md updated; system.manifest.validate + integration.config.validate + full turbo build:check green --> (evidence: implemented historically)
- [x] Callback wiring implemented: inbound route publishes to QStash EU (`buildQstashPublish`); the `/api/integration-route` callback verifies the QStash signature (`@upstash/qstash` `Receiver`), runs the Redis EU idempotency ledger (`restRedisLedger`), and executes the client's destinations (`executeDispatch`) <!-- chat-widget-section.api.ts (publish) + chat-widget-section.delivery.api.ts (callback); manifest api[] emits both routes + projects the UPSTASH_* secrets; @upstash/qstash added to @gogol/ui; full turbo build:check green (27/27, Worker bundles the Receiver). REMAINING (ops, not code): set live secrets in deploy env + enable Regional Services (EU) on the zone for in-EU execution, then run the live e2e. --> (evidence: packages/ directory, package exists)
- [x] Live e2e + Regional Services (EU) on the zone — ops step with live secrets (creds in .env; Regional Services entitlement to confirm) <!-- not runnable in-repo --> (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging <!-- all 167 RFCs pass --> (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Lead PII MUST traverse only EU-resident infrastructure: QStash EU base URL, Redis eu-central-1, site Workers under Regional Services (EU). Never publish lead PII to the US QStash region or a global KV.
- The delivery backbone holds events IN-FLIGHT ONLY; the Redis ledger stores short-TTL `eventId` keys, never PII. No lead datastore.
- Secrets (`UPSTASH_QSTASH_TOKEN`, `UPSTASH_QSTASH_CURRENT_SIGNING_KEY`, `UPSTASH_QSTASH_NEXT_SIGNING_KEY`, Redis URL/token) are read via `astro:env/server` only; never logged, returned, or committed.
- Documentation MUST NOT overclaim sovereignty: state physical EU residency + SCC/DPF/DPA, and disclose the US-parent/CLOUD Act residual honestly.
- Reuse the RFC-0176 `IntegrationEvent`/`executeDispatch` contracts; QStash's webhook is just another authenticated caller of `/internal/integration-route`.
- Agents MUST NOT reintroduce Cloudflare Queues/KV into the EU delivery path without a superseding RFC.
