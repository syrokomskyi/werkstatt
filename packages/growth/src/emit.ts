/*
<MODULE_CONTRACT>
<purpose>Facilitates event tracking by managing the active adapter and queuing events until the adapter is ready. Exposes a testable createEmitQueue() factory and a module-level singleton for application use.</purpose>
<non-goals>
  <item>Do not handle raw event parsing or transformation.</item>
  <item>Do not manage configuration or transport orchestration.</item>
  <item>Do not expose internal adapter methods to application code.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-10: Extracted createEmitQueue() factory so queue logic is testable without module-level state hacks. Added __webgogol_emit__ bridge assignment so shared UI components can fire events through the singleton.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: emit() is the SINGLE call-site for all event tracking.
// Application code never imports adapters directly (DNA-30). The locale
// field is injected automatically; callers MUST NOT include it in the payload.
// emit() never throws — errors from the adapter are caught internally.
// Events emitted before bootGrowthLayer() completes are queued and flushed.

/**
 * @gogol/growth — emit() singleton + createEmitQueue() factory
 *
 * The single call-site for all event tracking in application code.
 * Application code never imports adapters directly — all vendor coupling
 * is inside the adapter module itself (DNA-30).
 *
 * Usage (client-side only):
 *   import { emit } from "@gogol/growth/emit";
 *   emit("cta-click", { label: "hero-donate", href: "/de/spenden-kontakt" });
 *
 * The locale field is injected automatically from the active GrowthConfig;
 * callers must NOT include it in the payload.
 *
 * For tests, use createEmitQueue() to get an isolated instance:
 *   const queue = createEmitQueue();
 *   queue.emit("page-view", { path: "/" });
 *   expect(queue.getQueueLength()).toBe(1);
 *
 * RFC-0027 / DNA-27
 */

import type { GrowthAdapter, EmittedEvent, EventName, EventPayloadMap } from "./adapter.ts";

// ---------------------------------------------------------------------------
// EmitQueue interface — the narrow public surface of the factory
// ---------------------------------------------------------------------------

export interface EmitQueue {
  /** Emit a typed growth event. Queues if no adapter is registered. */
  emit<N extends EventName>(name: N, payload: Omit<EventPayloadMap[N], "locale">): void;
  /** Register the active adapter and flush any queued events. */
  setActiveAdapter(adapter: GrowthAdapter, locale: string): void;
  /** Tear down the active adapter and clear the queue. */
  destroyAdapter(): void;
  /** Number of events currently queued (waiting for adapter registration). */
  getQueueLength(): number;
}

// ---------------------------------------------------------------------------
// createEmitQueue() — testable factory
// ---------------------------------------------------------------------------

/**
 * Create an isolated emit queue with its own state.
 *
 * State lives in the closure — no module-level variables, no cross-test
 * pollution. The module-level singleton (below) is a thin wrapper around
 * a single instance created at import time.
 */
export function createEmitQueue(): EmitQueue {
  let adapter: GrowthAdapter | null = null;
  let locale = "en";
  const queue: EmittedEvent[] = [];

  function dispatchSafe(event: EmittedEvent): void {
    if (adapter?.accepts && !adapter.accepts.includes(event.name)) {
      if (typeof console !== "undefined") {
        console.warn(`[growth] Event "${event.name}" not in adapter.accepts — dropped.`);
      }
      return;
    }
    try {
      adapter!.track(event);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[growth] adapter.track() threw unexpectedly:", err);
      }
    }
  }

  return {
    emit<N extends EventName>(name: N, payload: Omit<EventPayloadMap[N], "locale">): void {
      const event: EmittedEvent<N> = {
        name,
        payload: { locale, ...payload } as EventPayloadMap[N],
        timestamp: new Date().toISOString(),
      };
      if (adapter) {
        dispatchSafe(event);
      } else {
        queue.push(event as EmittedEvent);
      }
    },

    setActiveAdapter(adp: GrowthAdapter, loc: string): void {
      adapter = adp;
      locale = loc;
      for (const queued of queue) {
        dispatchSafe(queued);
      }
      queue.length = 0;
    },

    destroyAdapter(): void {
      if (adapter?.destroy) {
        try {
          adapter.destroy();
        } catch {
          // never throw
        }
      }
      adapter = null;
      queue.length = 0;
    },

    getQueueLength(): number {
      return queue.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level singleton — used by application code via emit()
// ---------------------------------------------------------------------------

const _singleton = createEmitQueue();

/**
 * Emit a typed growth event.
 *
 * - Safe to call before bootGrowthLayer() completes — events are queued.
 * - Never throws; errors from the adapter are caught internally.
 * - The `locale` field is injected automatically; do not include it in payload.
 *
 * @param name   — event name from the closed EventName catalog (DNA-27)
 * @param payload — event-specific fields (locale is injected automatically)
 */
export function emit<N extends EventName>(
  name: N,
  payload: Omit<EventPayloadMap[N], "locale">,
): void {
  _singleton.emit(name, payload);
}

/**
 * Register the active adapter and flush any queued events.
 * Called exactly once per page by bootGrowthLayer() after GrowthAdapter.init() resolves.
 *
 * @internal
 */
export function _setActiveAdapter(adapter: GrowthAdapter, locale: string): void {
  _singleton.setActiveAdapter(adapter, locale);
}

/**
 * Tear down the active adapter (called on SPA navigation or test cleanup).
 * @internal
 */
export function _destroyAdapter(): void {
  _singleton.destroyAdapter();
  // Clean up the window bridge so UI components stop dispatching.
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>)[GROWTH_EMIT_KEY];
  }
}

// ---------------------------------------------------------------------------
// __webgogol_emit__ bridge — connects shared UI components to the singleton
// ---------------------------------------------------------------------------

/**
 * The window key where the emit bridge is exposed for shared UI components
 * that cannot import @gogol/growth/emit directly (e.g. Astro inline scripts
 * with define:vars).
 */
export const GROWTH_EMIT_KEY = "__webgogol_emit__";

// Set up the bridge at module initialization so it's available before
// bootGrowthLayer() completes. Events fired through the bridge before the
// adapter is ready are queued by the singleton and flushed on boot.
if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  if (typeof w[GROWTH_EMIT_KEY] !== "function") {
    w[GROWTH_EMIT_KEY] = (name: string, payload: Record<string, unknown>): void => {
      _singleton.emit(name as EventName, payload as Omit<EventPayloadMap[EventName], "locale">);
    };
  }
}
