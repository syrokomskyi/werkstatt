/*
<MODULE_CONTRACT>
<purpose>Adapter registry for rate source adapters (RFC-0744).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — registerRateSourceAdapter and getRateSourceAdapter.</item>
</CHANGE_SUMMARY>
*/

import type { RateSourceAdapter } from "./types.js";

const adapters = new Map<string, RateSourceAdapter>();

export function registerRateSourceAdapter(
  name: string,
  adapter: RateSourceAdapter,
): void {
  adapters.set(name, adapter);
}

export function getRateSourceAdapter(name: string): RateSourceAdapter | undefined {
  return adapters.get(name);
}

export function clearRateSourceAdapters(): void {
  adapters.clear();
}
