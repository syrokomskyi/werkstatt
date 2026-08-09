/*
<MODULE_CONTRACT>
<purpose>Phase 13: Canonical snapshot — stub for Wave 1.</purpose>
<non-goals>
  <item>Does not implement canonical serialization — Wave 4 (RFC-0442).</item>
  <item>Does not implement signature envelope — Wave 4 (RFC-0459).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 13: canonical-snapshot (stub).</item>
</CHANGE_SUMMARY>
*/

import type { PbpPublicationSnapshot } from "../publication.js";
import type { PbpBuildContext } from "../compiler-pipeline.js";
import type { PbpResolvedGraph } from "./types.js";

export async function snapshot(
  _graph: PbpResolvedGraph,
  _context: PbpBuildContext,
): Promise<PbpPublicationSnapshot | undefined> {
  return undefined;
}
