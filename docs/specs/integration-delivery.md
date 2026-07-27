# Integration delivery subsystem — spec

> Authoritative reading for AI agents and engineers working on lead/event delivery. Governing RFCs: **RFC-0168** (Integration Port), **RFC-0176** (destination hub), **RFC-0179** (scale + WfP, deferred), **RFC-0180** (provisioning), **RFC-0181** (EU-resident delivery via Upstash). **RFC-0177** governs storage/privacy.

## What this subsystem does

A visitor submits a lead (contact form per RFC-0168, or the UChat chat widget per RFC-0175). The lead becomes a normalized `IntegrationEvent`, is delivered **reliably** (retry + dead-letter + dedup), and is routed to the client's own destinations (CRM such as Pipedrive, and channels) **executing inside the client's own site with the client's own tokens**. The studio never becomes a CRM and never holds the client's destination tokens.

## Current architecture (EU-resident, RFC-0181)

Every source publishes the same `IntegrationEvent` to QStash — the exchange is standardized:

```
[site Worker — runs in the EU via Regional Services]
  sources (both publish to QStash):
    • send-message form  → POST /api/send-message            (first-party, same-origin)
    • UChat chat widget  → POST /api/integration-inbound      (signed: INTEGRATION_INBOUND_SECRET)
      │ publish IntegrationEvent → Upstash QStash (EU, eu-central-1)
      │   buildQstashPublish(): Upstash-Deduplication-Id = eventId, Upstash-Retries = N
      ▼
[Upstash QStash — EU (Frankfurt)]  — stores in-flight, retries (exp backoff), DLQ
      │ signed webhook (Upstash-Signature JWT) →
      ▼
[site /api/integration-route — EU]  (the single delivery fan-out, shared by all sources)
      │ 1. verify QStash signature (@upstash/qstash Receiver)
      │ 2. idempotency: restRedisLedger.firstSeen(eventId)  (Upstash Redis EU, SET NX)
      │ 3. deliverEvent(event, CLIENT tokens): channels (Telegram/WhatsApp) + CRM (Pipedrive)
      │ 4. email notification via Cloudflare Email Routing (send_email binding)
      ▼  200 → QStash done; non-2xx → QStash retries → DLQ
```

The callback route is declared by both the send-message and chat-widget manifests (identical; `api.routes.generate` dedupes by route) so a form-only site still emits it.

Key code (`@gogol/integration`):

- `qstash.ts` — `QSTASH_EU_BASE`, `buildQstashPublish` (pure), `IdempotencyLedger`, `restRedisLedger`. **The EU substrate.**
- `index.ts` — `deliverEvent` (the standardized fan-out: channels + CRM), `routeEventToReady`, `IntegrationEventSchema`, `authenticateInbound`, registries.
- `port.ts` — `IntegrationEvent`, `DestinationAdapter`, `eventToLeadMessage`/`eventToLead`.
- `adapters.ts` — Telegram + WhatsApp channels + Pipedrive. **No email adapter** — email is Cloudflare Email Routing (`send_email` binding) in the callback route.

## Why NOT Cloudflare Queues/KV

Cloudflare Queues and KV **cannot be pinned to the EU**: Regional Services (the data-localization mechanism) excludes non-HTTP triggers (Queues, Cron), and Workers KV has no jurisdiction restriction. Lead PII through a CF Queue is processed on potentially non-EU infrastructure → fails the firm EU-only requirement. RFC-0179's CF-queue substrate is therefore superseded by RFC-0181 for the EU path. (RFC-0179's WfP **hosting** decision survives but is deferred — see below.)

## EU residency — the honest argument (use this wording, do not overclaim)

Two distinct levels — never conflate them when talking to clients or writing the Datenschutz/DPA:

| Level | Upstash (QStash + Redis, eu-central-1) |
| --- | --- |
| **Physical residency** | ✅ Data stored & processed in the EU (Frankfurt, AWS eu-central-1). |
| **Legal instruments** | ✅ DPA (GDPR Art. 28) + SCC + EU-U.S. Data Privacy Framework. |
| **Structural sovereignty** | ❌ Upstash, Inc. is a **US (Delaware) C-Corp**; AWS is a US sub-processor. Residual **CLOUD Act** exposure is closed **contractually, not structurally**. |

**Truthful claim:** "Lead data is processed and stored physically in the EU (Frankfurt), transiently, under a DPA with SCC + EU-U.S. DPF." **Do NOT claim** "no US access" or "fully EU-sovereign" — that is false while a US-incorporated provider is in the chain.

**Tier 2 (future, for clients needing structural sovereignty / zero US parent):** an EU-incorporated or self-hosted substrate (e.g. Hetzner/Scaleway/OVH + self-hosted Redis and an EU-resident queue). Not built — documented so the claim is never overstated. Also note: true EU **execution** requires Regional Services (EU) on the site's zone (Data Localization Suite entitlement), independent of the storage layer.

## Privacy invariants (RFC-0177)

- The delivery substrate holds events **in-flight only** — no lead datastore. The Redis ledger stores short-TTL `eventId` keys, never PII.
- Destination **tokens execute only inside the client's site** (`astro:env/server`); they never enter the delivery substrate.
- Secrets — `UPSTASH_QSTASH_URL`, `UPSTASH_QSTASH_TOKEN`, `UPSTASH_QSTASH_CURRENT_SIGNING_KEY`, `UPSTASH_QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN` — are server-only, never logged, never committed. Provide them via untracked `.env` / deploy secrets, **never** pasted in chat or code.

## Scale & hosting (RFC-0179, deferred)

- Each site = **one** Cloudflare Worker (the per-site consumer was retired for shared delivery). A standard account holds **~500 sites**.
- **Workers for Platforms is deferred** until the site-Worker count approaches ~400 (buffer to the 500 limit) → then a limit-increase or WfP. WfP only changes how site Workers are hosted; the EU delivery substrate is unaffected.

## Agent rules (do / don't)

- DO reuse `IntegrationEvent` / `executeDispatch` / `routeEventToReady` — the QStash webhook is just another caller of `/api/integration-route`.
- DO keep lead PII on EU infrastructure only: `QSTASH_EU_BASE`, Redis eu-central-1, Workers under Regional Services (EU).
- DON'T reintroduce Cloudflare Queues/KV into the EU delivery path (superseded).
- DON'T persist event payloads; DON'T let the delivery substrate see destination tokens.
- DON'T overclaim EU sovereignty in any generated copy or legal text.
