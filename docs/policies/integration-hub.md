# Integration Hub, Billing & Consent-Gated Chat Widget

**References:** RFC-0168/0175/0176/0177/0181/0186/0191. Two authoritative references: **`docs/specs/integration-delivery.md`** is the canonical spec for the **delivery substrate** (EU-resident QStash + Redis, RFC-0181); **`docs/engineering/integration-hub-and-chat-widget.md`** covers the hub contracts + the chat widget.

## Model

The **client's own site is the integration hub** — never a studio-central, multi-tenant service. A normalized `IntegrationEvent` (from a _source_) is routed to _destinations_ declared in `system.md integrations.destinations[]`. Contracts live in `@warpgogol/integration`.

## Sources

Three first-party sources, each normalizing to one `IntegrationEvent`:

1. The `send-message` form (in-process, `/api/send-message`)
2. The chat widget (out-of-process — UChat POSTs to the section-owned route `/api/integration-inbound`, authenticated by `INTEGRATION_INBOUND_SECRET`)
3. **Stripe billing webhooks** (`/api/stripe-webhook`, signature-verified via `@warpgogol/integration-adapter-stripe` — RFC-0191)

Make.com is excluded from the funnel/billing path by contract.

## Destinations

Closed `DestinationKind` = `crm | calendar | email | scheduler`. Each has an `ExecutionMode`:

- **`gogol-adapter` (default)** runs on the client's site with the client's tokens
- **`vendor-native`** is executed by an upstream vendor (we hold no secret, run no code — declared only for validation + disclosure)

At most ONE active executor per `(kind, vendor)` — `integration.config.validate` enforces it (double-write guard).

## Reliable delivery (RFC-0181, EU-resident)

Supersedes the earlier Cloudflare-Queue substrate of RFC-0176/0179. Every source publishes the `IntegrationEvent` to **Upstash QStash** (`qstash-eu-central-1`, Frankfurt) via `buildQstashPublish()` (dedup header = `eventId`; bounded retries → DLQ). QStash signs a webhook to the single fan-out route **`/api/integration-route`**, which verifies the QStash signature (`@upstash/qstash` `Receiver`), idempotency-checks via an **Upstash Redis** short-TTL ledger (`restRedisLedger.firstSeen`), then `deliverEvent()` routes to the client's destinations (channels + CRM) with the client's tokens; email goes through Cloudflare Email Routing (`send_email` binding). The substrate is **in-flight only — never a lead datastore** (RFC-0177).

**Do NOT reintroduce Cloudflare Queues/KV into the EU delivery path** — Regional Services cannot pin non-HTTP triggers (Queues/Cron) or KV to the EU, so the per-site consumer Worker (`apps/<id>/workers/integration-consumer/`) was **retired**. The CF-queue primitives still exported from `@warpgogol/integration` (`enqueueEvent`, `consumeIntegrationBatch`, `kvDedup`) are legacy and are **not** the EU delivery path.

## Chat widget (RFC-0175)

Click-to-load: a first-party launcher is the only thing on the page; the vendor script is injected ONLY inside `ChatWidgetAdapter.load()`, called only on user activation. The widget binding is `system.md integrations.chat` (PUBLIC options only — e.g. `widgetId`; never secrets). Gated by the `integrations.chat` entitlement (RFC-0169). A new chat vendor = one adapter package + a catalog entry; never import a vendor SDK in `apps/*` or section code.

## Validators

In `sites-check.run`: `chat.config.validate`, `integration.config.validate`, `integration.secrets.validate` (secrets required only for `gogol-adapter`), `consent.activation.validate` (no third-party origin in dist HTML before activation — postbuild), `legal.processors.validate` (Datenschutz names processor + recipients + an Art. 28/DPA marker when a widget/destination is configured).

## Cloudflare + Astro v6 runtime gotchas

- `Astro.locals.runtime.env` is **removed in Astro v6** (it throws). Read runtime bindings via `import { env } from "cloudflare:workers"`. String secrets still come from `astro:env/server`.
- The delivery routes are **on-demand** Astro routes (`prerender = false`) on a `output: "static"` app; the Cloudflare adapter is attached only at build, so exercise runtime behavior via `astro build` + `wrangler dev` (workerd), not `astro dev` (Node). QStash + Upstash Redis are reached over plain HTTPS (`fetch`) — no Worker binding required — which is exactly why the EU substrate replaced the Cloudflare Queue/KV bindings.
- Client-side adapters MUST be loaded via **static** dynamic `import("@warpgogol/chat-adapter-uchat")` specifiers (not a `/* @vite-ignore */` variable) so Vite code-splits them into resolvable async chunks. The loader map lives in the **host** (the chat-widget section client in `@warpgogol/ui`) and is passed into `bindChatLauncher` — never in `@warpgogol/chat` itself, so the port package has no adapter dependency (avoids a workspace cycle).

## Lagebild shared sync worker (RFC-0186)

The Lagebild CRM buffer sync **must not** use per-site Workers. One shared platform Worker (`services/lagebild-sync-worker/`) serves all clients via a tenant registry (`sync_tenants`).

**Rules:**

- **Never** create `integrations/<site>/workers/supabase-sync/` folders.
- **Never** deploy per-site sync Workers.
- Tenant onboarding uses CLI: `lagebild.tenant.add --site <name>`.
- Secrets are injected via `wrangler secret put` to the shared Worker, never stored in Supabase.
- The shared Worker resolves secret references per-tenant from its environment.

**Validation:** `lagebild.validate` fails if per-site sync Worker folders exist.
