/*
<MODULE_CONTRACT>
<purpose>
Built-in no-op GrowthAdapter for development, testing, and staging where no
analytics vendor is configured. Logs events to console.debug; sends no data
externally.
</purpose>
<non-goals>
  <item>Do not send any data to external analytics vendors.</item>
  <item>Do not perform any data parsing or transformation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Inlined from the former @warpgogol/growth-adapter-null package (architecture review 2026-07-10). The null adapter is a built-in, not a vendor integration — it earns no separate package seam.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/growth — built-in NullAdapter
 *
 * No-op GrowthAdapter implementation. Use this in:
 *   - Local development (avoids polluting analytics with dev traffic)
 *   - Test environments
 *   - Staging builds where no analytics vendor is configured
 *
 * Events are logged to console.debug so developers can verify emit() calls
 * without sending data to a vendor.
 *
 * RFC-0027 / DNA-30
 */

import {
  EVENT_NAMES,
  type GrowthAdapter,
  type GrowthAdapterConfig,
  type EmittedEvent,
  type EventName,
} from "./adapter.ts";

export const NullAdapter: GrowthAdapter = {
  id: "null",
  accepts: EVENT_NAMES,

  async init(config: GrowthAdapterConfig): Promise<void> {
    console.debug("[growth:null] Adapter initialised.", {
      appId: config.appId,
      locale: config.locale,
    });
  },

  track<N extends EventName>(event: EmittedEvent<N>): void {
    console.debug("[growth:null] Event tracked:", event.name, event.payload);
  },

  identifySegment(segment: string | null): void {
    console.debug("[growth:null] Segment identified:", segment);
  },

  destroy(): void {
    console.debug("[growth:null] Adapter destroyed.");
  },
};
