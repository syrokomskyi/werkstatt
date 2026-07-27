/*
<MODULE_CONTRACT>
<purpose>
Single source of truth for the closed set of known growth adapter ids.
Imported by adapter.ts (re-export), provider.astro (loader map keys), and
the build-time validator growth.adapter.contract.
</purpose>
<non-goals>
  <item>Do not store adapter module specifiers here — those stay in provider.astro
        so the bundler does not statically resolve adapter packages that may not
        be a dependency of every consuming app.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-10: Extracted KNOWN_ADAPTER_IDS from adapter.ts into a
        dedicated registry module so the id list has one canonical home.</item>
</CHANGE_SUMMARY>
*/

/**
 * The closed set of registered growth adapter ids.
 *
 * The build-time validator `growth.vendor.resolve` imports this to check
 * that `system.md growth.vendor.adapter` references a real adapter.
 * The host's `GrowthAdapterLoaders` map (in `provider.astro`) must include
 * a loader for every id here. Keep this list in sync when adding adapters.
 *
 * To add a new adapter:
 * 1. Add its id here.
 * 2. Add a loader entry in `provider.astro` with the package specifier.
 * 3. Add the adapter package as a dependency in the consuming app's package.json.
 */
export const KNOWN_ADAPTER_IDS = ["null", "matomo"] as const;
