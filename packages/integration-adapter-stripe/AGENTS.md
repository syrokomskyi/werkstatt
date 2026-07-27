# `@gogol/integration-adapter-stripe` — Agent Guide

RFC-0191 Stripe webhook adapter: a first-party **source** (webhook verify + mapping + deep verify-and-map wrapper). Stripe is the billing authority; Lagebild mirrors it. **No Stripe SDK, no Make.com.**

## What it does

- **`verifyStripeSignature`** (`./signature`) — reproduces Stripe's HMAC-SHA256 scheme with `node:crypto`, constant-time, tolerance-windowed, **fail-closed**.
- **`stripeEventToIntegrationEvent`** (`./mapping`) — pure map of the closed Stripe event set → `IntegrationEvent` (`source: "stripe"`) or `null`. `checkout.session.completed` → funnel `payment.confirmed`; invoice/subscription/refund → typed lifecycle payloads.
- **`verifyAndMapStripeEvent`** (`./mapping`) — deep wrapper: signature verification + JSON parse + runtime shape validation (`StripeEventSchema`) + mapping + subscription metadata resolution for cycle invoices with no `lagebild_*` metadata. One call, one seam.
- **`StripeEventSchema`** (`./mapping`) — zod schema for the minimal Stripe Event shape; runtime validation before mapping.

## Rules for AI agents

- **Never import the Stripe SDK.** Raw `fetch` + `node:crypto` only — this is a deliberate constraint (bundle size, Worker compatibility, auditability).
- **Never import `astro:env`.** Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are injected by the route/worker; the package stays pure and unit-testable.
- **Prefer `verifyAndMapStripeEvent`** over manual verify + parse + map. The pure `stripeEventToIntegrationEvent` is still exported for cases where the caller already has a verified, parsed event.
- **Do not resolve the Organization here.** The mapping carries `stripeCustomerId`; the CRM-buffer destination (`@gogol/integration-adapter-supabase-crm`, RFC-0190) resolves Person → Deal → Org. The wrapper resolves `needsSubscriptionLookup` by fetching subscription metadata from Stripe when `stripeSecretKey` is provided.
- **Never log the secret or the signature.**
- This adapter is a vendor-isolated package — section code and `apps/*` import the route, never the Stripe specifics.

## Where it is wired

`@gogol/ui` → `packages/ui/src/integration-routes/stripe-webhook.api.ts` exposes `/api/stripe-webhook`. The mapped `IntegrationEvent` then flows through the EU-resident delivery substrate (QStash + Redis, RFC-0181) like any other source.

## Related

| Package / doc | Role |
| --- | --- |
| `@gogol/share/integration` | `IntegrationEvent` + lifecycle/invoice/subscription payload types + the funnel state machine |
| `@gogol/integration-adapter-supabase-crm` | CRM-buffer destination that resolves the Organization graph and queues Pipedrive sync |
| `docs/specs/visitor-funnel/02-stripe.md` | Stripe wiring spec (operator + integrator) |

## Validation

```sh
pnpm --filter @gogol/integration-adapter-stripe build:check
pnpm --filter @gogol/integration-adapter-stripe test
```

Governance commands (run per app): `billing.config.validate`, `billing.secrets.validate` (RFC-0191).
