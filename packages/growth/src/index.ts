/*
<MODULE_CONTRACT>
<purpose>Defines the server-side interface for the growth package, consolidating key types and configurations for external use.</purpose>
<non-goals>
  <item>Do not implement application logic or data manipulation.</item>
  <item>Do not manage transport or configuration orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhance file documentation to clarify the purpose and structure of exports in the growth package.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/growth — server-side re-exports
 *
 * This is the server/build-time surface of the growth package.
 * Import from specific sub-paths on the client:
 *   - "@warpgogol/growth/emit"    for emit()
 *   - "@warpgogol/growth/client"  for bootGrowthLayer()
 *   - "@warpgogol/growth/adapter" for GrowthAdapter / EmittedEvent types
 *   - "@warpgogol/growth/config"  for GrowthConfig types + schema
 *   - "@warpgogol/growth/provider" for the <GrowthProvider> Astro island
 *
 * RFC-0027 / DNA-27..30
 */

// Adapter types + EVENT_NAMES const — used by adapter package authors and validators
// EVENT_NAMES is the single source of truth for the closed EventName catalog (DNA-27).
export { EVENT_NAMES, KNOWN_ADAPTER_IDS } from "./adapter.ts";
export type {
  GrowthAdapter,
  GrowthAdapterConfig,
  EmittedEvent,
  EventName,
  EventPayloadMap,
  FunnelDefinition,
  FunnelStep,
} from "./adapter.ts";

// Config types + schema — used by build-time validators and <GrowthProvider>
export { GrowthConfigSchema, GrowthVendorConfigSchema, GROWTH_CONFIG_SCRIPT_ID } from "./config.ts";
export type { GrowthConfig, GrowthVendorConfig } from "./config.ts";

// GrowthAdapterLoaders type — used by provider.astro and host integrations
export type { GrowthAdapterLoaders } from "./client.ts";

// Built-in NullAdapter — inlined from former @warpgogol/growth-adapter-null package
export { NullAdapter } from "./null-adapter.ts";

// Emit factory + bridge — used by tests and shared UI type declarations
export { createEmitQueue, GROWTH_EMIT_KEY } from "./emit.ts";
export type { EmitQueue } from "./emit.ts";
