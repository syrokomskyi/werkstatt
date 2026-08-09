/*
<MODULE_CONTRACT>
<purpose>Facilitates client-side initialization and management of the growth layer within the browser environment.</purpose>
<non-goals>
  <item>Do not handle server-side logic or Node.js-specific operations.</item>
  <item>Do not manage raw content parsing outside of GrowthConfig.</item>
  <item>Do not import adapter packages — the HOST injects the loader map (keeps the
        port package free of any adapter dependency, so there is no workspace cycle).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: invert the adapter dependency — the host injects the loader map so
        @warpgogol/werkstatt-site/growth does not depend on the adapter packages (removes the workspace cycle and
        eliminates the @vite-ignore dynamic import).</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/werkstatt-site/growth — bootGrowthLayer()
 *
 * This module runs exclusively in the browser. It is bundled by Vite as part
 * of <GrowthProvider client:load> and must not import any Node.js-only APIs.
 *
 * Responsibilities:
 *   1. Parse the GrowthConfig JSON injected by <GrowthProvider> server-side.
 *   2. Dynamically import the configured vendor adapter module.
 *   3. Call adapter.init(config) and then _setActiveAdapter().
 *   4. Emit the synthetic "page-view" event.
 *
 * RFC-0027 / DNA-29
 */

import { GrowthConfigSchema, GROWTH_CONFIG_SCRIPT_ID, type GrowthConfig } from "./config.ts";
import { _setActiveAdapter, _destroyAdapter, emit } from "./emit.ts";
import type { GrowthAdapter } from "./adapter.ts";

/**
 * Host-supplied adapter loader map: adapter id → a thunk that dynamically imports
 * the adapter package and returns its default export. The HOST (e.g. the
 * <GrowthProvider> Astro island) owns this map with STATIC `import()` specifiers
 * so the bundler code-splits each adapter into a resolvable async chunk. Keeping
 * it here (in the host, not the port) avoids @warpgogol/werkstatt-site/growth depending on the
 * adapter packages — which would form a workspace cycle (adapters already depend
 * on @warpgogol/werkstatt-site/growth).
 */
export type GrowthAdapterLoaders = Record<string, () => Promise<{ default: GrowthAdapter }>>;

/**
 * The global window key used as a boot guard to prevent double-init on SPA
 * navigations or HMR.
 */
const GROWTH_BOOTED_KEY = "__warpgogol_growth_booted__";

// ---------------------------------------------------------------------------
// bootGrowthLayer()
// ---------------------------------------------------------------------------

/**
 * Main entry point called by <GrowthProvider client:load>.
 *
 * Reads the config JSON from the DOM, loads the adapter via the host-supplied
 * loader map, initialises it, registers it with emit(), and fires the initial
 * page-view event.
 *
 * Idempotent — safe to call multiple times (subsequent calls are no-ops).
 *
 * @param loaders host-supplied adapter id → import() map (static specifiers).
 */
export async function bootGrowthLayer(loaders: GrowthAdapterLoaders): Promise<void> {
  // Guard against double-init on SPA navigations or HMR.
  if ((window as unknown as Record<string, unknown>)[GROWTH_BOOTED_KEY]) {
    return;
  }
  (window as unknown as Record<string, unknown>)[GROWTH_BOOTED_KEY] = true;

  // 1. Parse config from DOM.
  const config = _readConfig();
  if (!config) {
    console.warn("[growth] <GrowthProvider> config not found — growth layer inactive.");
    return;
  }

  // 2. Load + initialise adapter via host-supplied loader map.
  const adapter = await _loadAdapter(config.vendor.adapter, loaders);
  if (!adapter) {
    console.warn(
      `[growth] Adapter "${config.vendor.adapter}" could not be loaded — events will be no-op.`,
    );
    return;
  }

  try {
    await adapter.init({
      appId: config.appId,
      locale: config.locale,
      vendor: config.vendor.options,
    });
  } catch (err) {
    console.warn("[growth] adapter.init() threw:", err);
    return;
  }

  // 3. Register adapter — this flushes any queued events.
  _setActiveAdapter(adapter, config.locale);

  // 4. Emit synthetic page-view.
  emit("page-view", { path: location.pathname });
}

/**
 * Tear down the growth layer.
 * Call this before unmounting on SPA navigations if you want to re-init.
 */
export function destroyGrowthLayer(): void {
  _destroyAdapter();
  delete (window as unknown as Record<string, unknown>)[GROWTH_BOOTED_KEY];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _readConfig(): GrowthConfig | null {
  const el = document.getElementById(GROWTH_CONFIG_SCRIPT_ID);
  if (!el) return null;

  try {
    const raw = JSON.parse(el.textContent ?? "{}");
    return GrowthConfigSchema.parse(raw);
  } catch (err) {
    console.warn("[growth] Failed to parse GrowthConfig:", err);
    return null;
  }
}

/**
 * Resolve the adapter by id from the host-supplied loader map (enum-dispatch).
 * Unknown ids warn and return null (the growth layer then no-ops).
 * The vendor module is reached ONLY here, after bootGrowthLayer() is called.
 */
async function _loadAdapter(
  adapterId: string,
  loaders: GrowthAdapterLoaders,
): Promise<GrowthAdapter | null> {
  const loader = loaders[adapterId];
  if (!loader) {
    console.warn(
      `[growth] Unknown adapter id "${adapterId}". Add it to the host's adapter loader map.`,
    );
    return null;
  }

  try {
    const mod = await loader();
    return mod.default;
  } catch (err) {
    console.warn(`[growth] Failed to import adapter "${adapterId}":`, err);
    return null;
  }
}
