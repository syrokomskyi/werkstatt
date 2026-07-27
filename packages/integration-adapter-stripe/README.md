# @warpgogol/integration-adapter-stripe

RFC-0191 Stripe webhook adapter — a first-party **source** with a deep verify-and-map wrapper. Stripe is the billing authority; Lagebild is the mirror. **No Stripe SDK** (raw `fetch` + `node:crypto`), **no Make.com**.

## Purpose

One responsibility, vendor-isolated to this package:

1. **Source** — verify an incoming Stripe webhook, validate its shape at runtime, map it to a normalized `IntegrationEvent` (`source: "stripe"`), and resolve subscription metadata when needed. Consumed by the `/api/stripe-webhook` route in `@warpgogol/ui`.

## Public surface

| Export | Subpath | Role | | --- | --- | --- | --- | | `verifyStripeSignature(rawBody, header, secret, …)` | `./signature` | HMAC-SHA256 over `${timestamp}.${rawBody}`, constant-time compare within a tolerance window; **fail-closed** when the secret/header is absent. `node:crypto` only. | | `stripeEventToIntegrationEvent(event)` | `./mapping` | Pure map of the closed Stripe event set → `IntegrationEvent | null`. `checkout.session.completed`→ funnel`payment.confirmed`; invoice/subscription/refund → typed lifecycle payloads. Unmapped types → `null` (ignored). | | `verifyAndMapStripeEvent(rawBody, header, secret, opts?)` | `./mapping` | Deep wrapper: signature verification + JSON parse + `StripeEventSchema` validation + mapping + subscription metadata resolution. Returns `{ ok, event }` or `{ ok: false, error }`. | | `StripeEventSchema` | `./mapping` | Zod schema for the minimal Stripe Event shape; runtime validation before mapping. | | `STRIPE_ADAPTER_SECRETS` | `.` | `["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]` — per-tenant server secrets. |

## Required secrets

- `STRIPE_SECRET_KEY` — the tenant's Stripe secret key (server-only).
- `STRIPE_WEBHOOK_SECRET` — the endpoint signing secret used by `verifyStripeSignature`.

Both are injected by the route/worker — this package **never** imports `astro:env`. `billing.secrets.validate` checks they are declared in the generated env schema when Stripe is a funnel source.

## Related

| Package | Role |
| --- | --- |
| `@warpgogol/share/integration` | `IntegrationEvent`, lifecycle/invoice/subscription payload types, the funnel state machine |
| `@warpgogol/ui` (`integration-routes/stripe-webhook.api.ts`) | The `/api/stripe-webhook` route that calls `verifyAndMapStripeEvent` |
| `docs/specs/visitor-funnel/02-stripe.md` | Operator/integrator spec for the Stripe wiring |

## Validation

```sh
pnpm --filter @warpgogol/integration-adapter-stripe build:check
pnpm --filter @warpgogol/integration-adapter-stripe test
```
