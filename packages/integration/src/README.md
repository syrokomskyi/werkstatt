# `@warpgogol/share/integration`

Vendor-agnostic lead/event delivery: normalize a captured lead into an `IntegrationEvent`, deliver it reliably, and route it to the client's own destinations (CRM/channels) **executing inside the client's site with the client's tokens**. The studio never becomes a CRM and never holds a destination token.

Full architecture + the EU-residency argument: **[`docs/specs/integration-delivery.md`](../../../../docs/specs/integration-delivery.md)**. Governing RFCs: 0168, 0176, 0177, 0179, 0180, **0181**.

## Modules

| File | Role |
| --- | --- |
| `port.ts` | `IntegrationEvent`, `Lead`, `DestinationAdapter`, secrets bag. The contracts. |
| `port-barrel.ts` | Types-only barrel (`@warpgogol/share/integration/port`) — re-exports port + sibling type modules without pulling in adapter implementations. Type-only consumers (agent-gate, supabase-crm tests) import from here. |
| `index.ts` | Full barrel (`@warpgogol/share/integration`) — types + runtime (registries, fan-out, delivery handler). |
| `orchestration.ts` | Registries + `routeEventToReady`, `authenticateInbound`. |
| `delivery-handler.ts` | `createDeliveryHandler` — QStash delivery callback factory. |
| `qstash.ts` | **EU delivery substrate (RFC-0181):** `buildQstashPublish` (→ Upstash QStash EU), `IdempotencyLedger` / `restRedisLedger` (→ Upstash Redis EU). |
| `dispatch.ts` | `executeDispatch` — the site-side route body that runs destinations with the client's tokens. |
| `sharding.ts` | RFC-0179 CF-queue placement — **superseded for the EU path by RFC-0181** (retained, not used for EU delivery). |
| `adapters.ts` | Channel + Pipedrive destination adapters. |

## Delivery flow (EU)

1. A source publishes an `IntegrationEvent` to **Upstash QStash (EU)** via `buildQstashPublish` (dedup on `eventId`, N retries).
2. QStash delivers a **signed webhook** to the site's `POST /internal/integration-route`.
3. The route verifies the QStash signature, checks `restRedisLedger.firstSeen(eventId)` (Upstash Redis EU), then `executeDispatch` routes to the client's destinations.
4. `200` acks; a non-2xx triggers QStash retry → DLQ.

## EU residency — say it accurately

Physical EU residency (Frankfurt, eu-central-1) + DPA/SCC/EU-U.S. DPF: **yes**. Structural sovereignty: **no** — Upstash is US-incorporated (CLOUD Act exposure closed contractually, not structurally). Never claim "no US access". See the spec for the exact wording and the tier-2 (EU-incorporated/self-hosted) path.

## Secrets (server-only, never committed)

`UPSTASH_QSTASH_URL`, `UPSTASH_QSTASH_TOKEN`, `UPSTASH_QSTASH_CURRENT_SIGNING_KEY`, `UPSTASH_QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, plus each destination's tokens (e.g. `INTEGRATION_PIPEDRIVE_API_TOKEN`) and `INTEGRATION_INBOUND_SECRET`. Read via `astro:env/server`; provide through untracked `.env` / deploy secrets only.

## Tests

`node --import tsx --test src/integration/tests/*.test.ts` (run via `pnpm --filter @warpgogol/share test`). Covers QStash publish + Redis ledger, the dispatch seam, sharding, and the inbound/route runtime.
