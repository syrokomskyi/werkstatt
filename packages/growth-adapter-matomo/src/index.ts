/*
<MODULE_CONTRACT>
<purpose>Provide the compatibility root entrypoint for the Matomo growth adapter package.</purpose>
<non-goals>
  <item>Do not host adapter implementation details in the root barrel.</item>
  <item>Do not widen the GrowthAdapter port with Matomo-specific methods.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: switch Matomo tracking to Messkanon over first-party proxy and production-only runtime gates.</item>
  <item>Architecture review: binding-driven adapter (no hardcoded tables), MatomoTransport seam, factory pattern, accepts field.</item>
  <item>RFC-0264 cleanup: split the implementation into adapter, binding, and transport subpaths while keeping the root entrypoint as a thin re-export layer.</item>
</CHANGE_SUMMARY>
*/

/**
 * @gogol/growth-adapter-matomo
 *
 * Matomo Analytics implementation of GrowthAdapter. Prefer direct subpath
 * imports for new code:
 *
 * - @gogol/growth-adapter-matomo/adapter
 * - @gogol/growth-adapter-matomo/binding
 * - @gogol/growth-adapter-matomo/transport
 */

export { createMatomoAdapter, default } from "./adapter.ts";
export { DEFAULT_MATOMO_BINDING } from "./binding.ts";
export type { MatomoBinding, MatomoBindingDimension, MatomoBindingEvent } from "./binding.ts";
export { BrowserMatomoTransport, StubMatomoTransport } from "./transport.ts";
export type { MatomoTransport } from "./transport.ts";
