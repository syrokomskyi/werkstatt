/*
<MODULE_CONTRACT>
<purpose>
  RFC-0168: Integration Port barrel. Re-exports types from port.ts, crm-buffer.ts,
  funnel.ts, lifecycle.ts, sharding.ts, dispatch.ts, qstash.ts, and runtime
  orchestration (registries + fan-out) from orchestration.ts. Type-only consumers
  (agent-gate, supabase-crm tests) import from `./port-barrel.ts` (`@warpgogol/share/integration/port`)
  to avoid transitively pulling in adapter implementations; consumers needing
  runtime logic import from here — the orchestration module is re-exported transparently.
</purpose>
<non-goals>
  <item>Do not define logic here — pure re-export barrel.</item>
  <item>Do not import astro:env — the caller injects the secrets bag.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0168: initial implementation.</item>
  <item>Deepening: split orchestration (registries + fan-out) into orchestration.ts; index.ts is now a pure barrel.</item>
</CHANGE_SUMMARY>
*/

export * from "./port.ts";
// Lagebild MVP: CRM buffer types (contacts, deals, stage_transitions, sync_outbox).
export * from "./crm-buffer.ts";
// RFC-0188: Visitor Sales Funnel state-machine contracts (platform-owned graph).
export * from "./funnel.ts";
// RFC-0191: Client Lifecycle & Stripe Billing event contracts (sibling to the funnel).
export * from "./lifecycle.ts";
// RFC-0179: shared sharded delivery placement + the dynamic-dispatch execution seam.
// NOTE: the Cloudflare-queue naming in sharding.ts is SUPERSEDED for the EU delivery
// path by RFC-0181 (Upstash QStash/Redis); the dispatch seam (executeDispatch) is reused.
export * from "./sharding.ts";
export * from "./dispatch.ts";
// RFC-0181: EU-resident delivery substrate (Upstash QStash EU + Redis EU).
export * from "./qstash.ts";
// Registries + fan-out + inbound auth + legacy delivery substrate types.
export * from "./orchestration.ts";
// RFC-0181: QStash delivery callback factory (architecture review).
export * from "./delivery-handler.ts";
