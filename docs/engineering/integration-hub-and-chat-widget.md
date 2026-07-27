# Integration Hub & Consent-Gated Chat Widget

> **Established by:** RFC-0168 · RFC-0175 · RFC-0176 · RFC-0177 (related: RFC-0169 entitlements, RFC-0191 Stripe billing)
>
> **Delivery substrate:** the reliable-delivery mechanism moved to **EU-resident Upstash QStash + Redis (RFC-0181)**, superseding the Cloudflare Queues design below. **`docs/specs/integration-delivery.md` is the authoritative spec for delivery** — this doc covers the hub _contracts_ and the chat widget.

How a lead, message, or payment captured on a client site reaches the client's systems — CRM, calendar, email, scheduler — and how the on-site chat widget is loaded without violating EU privacy law.

---

## The core principle: the client's site IS the hub

Everything a client integrates with — Pipedrive, their calendar, their mailbox — **belongs to the client**. We standardize the _exchange_ between those integrations **on the client's own site**, using the **client's own tokens**.

This is **not** a studio-central, multi-tenant service. We never pool many clients' personal data into one studio-operated system (that would make the studio a heavyweight GDPR processor with a single breach surface). Each client's site is its own isolated hub on its own Cloudflare deploy. The studio is the site's operator/processor under a per-client DPA — the same relationship the contact form already entails.

```
        sources (each → one IntegrationEvent)        EU-resident delivery (RFC-0181)            destinations
  ┌──────────────────────────────────┐        ┌──────────────────────────────────────┐    ┌────────────────────┐
  │ send-message form  /api/send-…   │        │ publish → Upstash QStash (Frankfurt)  │    │ CRM (Pipedrive)     │
  │ UChat widget       /api/integ…   │──pub──▶│   dedup=eventId, retries → DLQ        │    │ calendar            │
  │ Stripe webhook     /api/stripe-… │        │ signed webhook ▼                      │───▶│ email               │
  │                                  │        │ /api/integration-route               │    │ scheduler           │
  │                                  │        │   verify · Redis dedup · deliverEvent │    │ (client's tokens)   │
  └──────────────────────────────────┘        └──────────────────────────────────────┘    └────────────────────┘
   the substrate holds events in-flight only — never a lead datastore (RFC-0177)
```

---

## Part 1 — The chat widget (RFC-0175)

A consent-gated, vendor-agnostic popup chat. Piloted with **UChat** on `apps/webgogol-com`.

### Click-to-load (the privacy mechanism)

The page renders only a **first-party launcher button**. No third-party script, iframe, network request, or storage exists until the visitor **clicks**. On click, `@gogol/chat/client` (`bindChatLauncher`) dynamically imports the configured adapter, calls `load()` (which injects the vendor script), then `open()`. This is stronger than a cookie banner — nothing third-party loads to be consented to in the first place — and is why **no cookie banner / CMP** is used.

### Packages

| Package | Role |
| --- | --- |
| `@gogol/chat` | `ChatWidgetAdapter` contract, `ChatWidgetConfig`, click-to-load loader, closed `CHAT_ADAPTER_IDS` |
| `@gogol/chat-adapter-uchat` | UChat adapter — the ONLY place the UChat origin appears. Loads `https://www.uchat.com.au/js/widget/<widgetId>/popup.js` |
| `@gogol/chat-adapter-null` | No-op default (CI/dev/unentitled) |
| `packages/ui/src/sections/chat-widget/` | The first-party launcher section + the inbound API route (see Part 2) |

### Configure a site

```yaml
# apps/<id>/src/content/system.md
entitlementsOverride:        # or resolved from Stripe (RFC-0169)
  - integrations.chat
integrations:
  chat:
    adapter: uchat
    options:
      widgetId: ndslwdpu82roynku   # PUBLIC value only — never a secret
```

Then place the block on a page and add its cosmicName (`Amalthea`) to that page's `planets[]`:

```yaml
blocks:
  - id: chat
    type: chat-widget
    props:
      launcherLabel: "Chat öffnen"
      legalNotice: "Mit dem Öffnen des Chats wird ein Drittanbieter-Widget (UChat) geladen; …"
      privacyPolicyLabel: "Datenschutzerklärung"
      privacyPolicyPageId: datenschutz   # semantic pageId — resolved per-locale (NOT a raw href)
```

### Add a new chat vendor

1. New package `@gogol/chat-adapter-<vendor>` implementing `ChatWidgetAdapter` (`load()` injects the vendor script lazily; `open()`).
2. Add the id to `CHAT_ADAPTER_IDS` in `@gogol/chat/src/port.ts`.
3. Register a **static** `import("@gogol/chat-adapter-<vendor>")` in the **host's** adapter-loader map — the chat-widget section client (`packages/ui/src/sections/chat-widget/chat-widget-section.client.ts`) builds a `ChatAdapterLoaders` map and passes it to `bindChatLauncher`. Static so the bundler code-splits it into a resolvable async chunk (a `/* @vite-ignore */` variable import is **not** bundled and fails in the browser). The map lives in the host, not in `@gogol/chat`, so the port package has no adapter dependency (avoids a workspace cycle: adapters → `@gogol/chat`).

Never import a chat vendor SDK in `apps/*` or section code.

---

## Part 2 — The integration hub (RFC-0176, amends RFC-0168)

Contracts live in `@gogol/integration` (pure — secrets are an injected bag; no `astro:env`, no vendor SDK).

### Normalized event

```ts
interface IntegrationEvent {
  eventId: string;              // idempotency key — dedup on redelivery
  kind: "lead" | "message" | "appointment";
  source: string;               // "send-message" | "uchat" | …
  locale: string;
  occurredAt: string;           // ISO-8601
  contact?: { name?: string; email?: string; phone?: string };
  payload: Record<string, unknown>;
}
```

### Destinations & execution modes

A closed `DestinationKind` = `crm | calendar | email | scheduler`. Each configured destination declares an **execution mode**:

- **`gogol-adapter` (default)** — a `DestinationAdapter` runs on the client's site with the client's tokens. Integration logic lives in versioned, tested code.
- **`vendor-native`** — an upstream vendor's own flow executes it; the studio holds no secret and runs no code (declared only for validation + the privacy disclosure).

Same contract, swappable mode. **At most one active executor per `(kind, vendor)`** — `integration.config.validate` enforces this (double-write guard).

```yaml
integrations:
  inbound:
    sources: [uchat]            # enables /api/integration-inbound
  destinations:
    - { kind: crm, vendor: pipedrive, mode: gogol-adapter }
```

### Sources

- **send-message form** — in-process (the existing RFC-0168 path), `/api/send-message`.
- **chat widget** — out-of-process. UChat's flow POSTs the `IntegrationEvent` to the **section-owned route** `/api/integration-inbound`, authenticated by `INTEGRATION_INBOUND_SECRET`. The route is emitted by `api.routes.generate` from the chat-widget manifest's `api[]` block (which also projects the secrets into the env schema).
- **Stripe billing webhook** (RFC-0191) — out-of-process. Stripe POSTs to `/api/stripe-webhook`; the route verifies the signature and maps the Stripe event to an `IntegrationEvent` via `@gogol/integration-adapter-stripe` (no Stripe SDK — raw `fetch` + `node:crypto`). Stripe is the billing authority; Lagebild is the mirror. This source feeds the Visitor Sales Funnel (RFC-0188) lifecycle — see `docs/specs/visitor-funnel/`.

### Add a new destination

Implement `DestinationAdapter` (`kind`, `vendor`, `requiredSecrets`, `route(event, secrets)`) in `@gogol/integration/adapters.ts`, register it in `DESTINATION_ADAPTERS`, and add the `(kind, vendor)` to the catalog. `gogol-adapter` reads secrets from the injected bag only.

---

## Part 3 — Reliable delivery (EU-resident Upstash QStash + Redis, RFC-0181)

A reliability-positioned studio cannot drop a lead when a destination is briefly down — and a German-`e.V.`/SME client base means lead PII must stay physically in the EU. The delivery substrate therefore uses **Upstash QStash + Redis (eu-central-1, Frankfurt)**, not Cloudflare Queues/KV. **Full spec: `docs/specs/integration-delivery.md` (authoritative).**

- Each source **publishes** the `IntegrationEvent` to QStash via `buildQstashPublish()` (`@gogol/integration/qstash.ts`): `Upstash-Deduplication-Id = eventId`, bounded `Upstash-Retries`, exponential backoff → DLQ on exhaustion.
- QStash signs a webhook to the single fan-out route **`/api/integration-route`** (declared by both the send-message and chat-widget manifests; `api.routes.generate` dedupes the route). The handler: (1) verifies the QStash signature (`@upstash/qstash` `Receiver`); (2) idempotency-checks via `restRedisLedger.firstSeen(eventId)` (Upstash Redis `SET NX`, short TTL — never PII); (3) runs `deliverEvent()` (channels + CRM, with the client's tokens); (4) sends the email notification through Cloudflare Email Routing (`send_email` binding). `200` → done; non-2xx → QStash retries → DLQ.

> **Why not Cloudflare Queues/KV?** Regional Services (the data-localization mechanism) excludes non-HTTP triggers (Queues, Cron), and Workers KV has no jurisdiction restriction — so lead PII through a CF Queue could be processed on non-EU infrastructure, failing the firm EU-only requirement. `cloudflare.residency.validate` now **fails the build** if a `wrangler.jsonc` declares `kv_namespaces` or `queues`. The CF-queue primitives still exported from `@gogol/integration` (`enqueueEvent`, `consumeIntegrationBatch`, `kvDedup`) are **legacy** and are not on the EU path; the per-site consumer Worker (`apps/<id>/workers/integration-consumer/`) was **retired**.

- The substrate holds events **in-flight only** — it is **never a datastore** of leads/conversations (RFC-0177 clause 4). The Redis ledger stores short-TTL `eventId` keys, never PII.

---

## Part 4 — Storage & consent policy (RFC-0177)

Codified in the root `AGENTS.md` storage-policy section. In short:

1. **First-party cookie ban is absolute** — no `document.cookie`/`Set-Cookie` in `apps/*` or `packages/*`.
2. A **third-party widget may set its own storage** — only because it is click-to-load and the storage is set by the vendor's origin, not our code.
3. **No third-party anything before activation** (enforced by `consent.activation.validate` against the built HTML).
4. **Server-side: credentials/OAuth tokens may be stored; visitor/lead PII may not** (the delivery substrate is in-flight only).
5. **Disclosure + DPA** — any configured widget/destination must name the vendor (processor) + recipients and reference an Art. 28 DPA in the Datenschutz (checked by `legal.processors.validate`).

---

## Validators (all in `sites-check.run`)

| Command | Phase | Checks |
| --- | --- | --- |
| `chat.config.validate` | author | chat adapter id ∈ catalog; required public options present |
| `integration.config.validate` | author | adapter ids + destination kind/vendor ∈ catalog; one active executor per `(kind,vendor)`; inbound needs its secret |
| `integration.secrets.validate` | author | configured adapters' secrets declared; `gogol-adapter` destinations need secrets, `vendor-native` none |
| `consent.activation.validate` | postbuild | no third-party widget origin in `dist` HTML before activation |
| `legal.processors.validate` | author | processor + recipients disclosure + DPA marker when a widget/destination is configured |

---

## Cloudflare + Astro v6 runtime notes (gotchas)

- **`Astro.locals.runtime.env` is removed in Astro v6** (it throws). Read any remaining runtime binding (the Email Routing `send_email` binding) via `import { env } from "cloudflare:workers"`. String secrets (`UPSTASH_*`, `INTEGRATION_INBOUND_SECRET`, `STRIPE_*`, Pipedrive tokens) come from `astro:env/server`.
- **QStash + Upstash Redis are reached over plain HTTPS (`fetch`)** — no Worker binding, no `--remote`-only resource. This is precisely why the EU substrate replaced Cloudflare Queue/KV bindings, and why `cloudflare.residency.validate` forbids declaring `kv_namespaces`/`queues` in `wrangler.jsonc`.
- The app runs `output: "static"` with on-demand routes (`prerender = false`); the Cloudflare adapter is attached only on build, so test runtime behavior via `astro build` + `wrangler dev` (workerd), not `astro dev` (Node).

---

## Go-live runbook (per client)

The code, routes, and unit tests are in place. To activate live delivery (full version + the EU-residency argument: `docs/specs/integration-delivery.md`):

1. **Provision the EU substrate** — an Upstash QStash project and an Upstash Redis database, both in **eu-central-1 (Frankfurt)**.
2. **Set secrets** (server-only, never committed): `UPSTASH_QSTASH_URL`, `UPSTASH_QSTASH_TOKEN`, `UPSTASH_QSTASH_CURRENT_SIGNING_KEY`, `UPSTASH_QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, plus `INTEGRATION_INBOUND_SECRET` and the destination tokens (`INTEGRATION_PIPEDRIVE_API_TOKEN`, `INTEGRATION_PIPEDRIVE_DOMAIN`). Stripe billing adds `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (RFC-0191).
3. **EU execution** — enable Cloudflare Regional Services (EU) on the site's zone so the Worker itself runs in-region (Data Localization Suite entitlement); `cloudflare.regional-services.validate` checks the live config.
4. **Local end-to-end test**:
   ```bash
   pnpm --filter webgogol-com build
   wrangler dev -c apps/webgogol-com/wrangler.jsonc --persist-to .wrangler/state
   # POST a signed IntegrationEvent to /api/integration-inbound → it publishes to QStash,
   # QStash calls back /api/integration-route → verify · dedup · deliver.
   ```
5. **Wire UChat** — configure the UChat flow to POST the `IntegrationEvent` to `https://<site>/api/integration-inbound` with header `X-Integration-Secret: <INTEGRATION_INBOUND_SECRET>` (or `Authorization: Bearer …`).
6. **Set the public widget id** — `system.md integrations.chat.options.widgetId` (the pilot uses `ndslwdpu82roynku`).

---

## Pilot status (webgogol-com)

- ✅ Chat widget placed on the contact page (de + uk); production build renders the first-party launcher with **no `uchat.com.au` origin in static HTML** (click-to-load verified); `consent.activation.validate` passes.
- ✅ Hub contracts, destination registry, inbound route, **QStash publish + signed `/api/integration-route` callback + Redis dedup**, `deliverEvent` fan-out — all wired; `hub-runtime.test.ts` + `qstash.test.ts` + `deliver-event.test.ts` green (route-once, redelivery dedup, fail-closed auth, schema rejection).
- ✅ Datenschutz already discloses UChat (processor) + Pipedrive (recipient) + Art. 28 DPA.
- ⏳ Live Upstash (QStash + Redis, EU) + CF Regional Services + secrets + the `wrangler dev` e2e + UChat flow wiring — the go-live runbook above (needs the client's account).

See also: `docs/engineering/growth-adapters.md` (the sibling vendor-port pattern) and the RFCs listed at the top.
