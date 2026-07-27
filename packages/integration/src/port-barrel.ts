/*
<MODULE_CONTRACT>
<purpose>
  RFC-0168: Integration Port barrel — types and pure contracts only. Re-exports from
  port.ts, crm-buffer.ts, funnel.ts, lifecycle.ts, sharding.ts, dispatch.ts, and qstash.ts.
  Type-only consumers import from here to avoid transitively pulling in adapter
  implementations (orchestration.ts → adapters.ts).
</purpose>
<non-goals>
  <item>Do not re-export orchestration.ts, delivery-handler.ts, or adapters.ts — those are runtime.</item>
  <item>Do not define logic here — pure re-export barrel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: split from index.ts so type-only consumers don't transitively import adapter implementations.</item>
</CHANGE_SUMMARY>
*/

export * from "./port.ts";
export * from "./crm-buffer.ts";
export * from "./funnel.ts";
export * from "./lifecycle.ts";
export * from "./sharding.ts";
export * from "./dispatch.ts";
export * from "./qstash.ts";
