/*
<MODULE_CONTRACT>
<purpose>Phase 8: Runtime overlay application — stub for Wave 1.</purpose>
<non-goals>
  <item>Does not implement runtime overlays — Wave 3 (RFC-0421).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 8: runtime-overlays (stub).</item>
</CHANGE_SUMMARY>
*/

import type { PbpResolvedGraph } from "./types.js";

export async function applyRuntimeOverlays(graph: PbpResolvedGraph): Promise<PbpResolvedGraph> {
  return graph;
}
