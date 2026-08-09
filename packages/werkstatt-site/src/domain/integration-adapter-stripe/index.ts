/*
<MODULE_CONTRACT>
<purpose>RFC-0191: public surface of the Stripe webhook adapter — the webhook signature verifier,
the Stripe→IntegrationEvent mapping, and a deep verify-and-map wrapper that folds signature
verification, JSON parsing, runtime shape validation, and subscription metadata resolution into
one call. Stripe is the billing authority, Lagebild the mirror. No Stripe SDK, no Make.com.</purpose>
<non-goals>
  <item>Do not import astro:env or the Stripe SDK — secrets are injected by the route/worker.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial Stripe adapter package surface.</item>
  <item>Architecture review: removed phantom billing client; added verifyAndMapStripeEvent.</item>
</CHANGE_SUMMARY>
*/

export { verifyStripeSignature } from "./signature.ts";
export {
  stripeEventToIntegrationEvent,
  verifyAndMapStripeEvent,
  StripeEventSchema,
  type StripeEventLike,
  type VerifyAndMapResult,
} from "./mapping.ts";

/** Server secret names the Stripe adapter requires (per tenant — RFC-0186/0191). */
export const STRIPE_ADAPTER_SECRETS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;
