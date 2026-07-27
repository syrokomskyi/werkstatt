/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/shared.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not modify node structure.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added graph deduplication utility keyed by @id.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdNode } from "./types.ts";

export function dedupeGraph(nodes: JsonLdNode[]): JsonLdNode[] {
  const seenIds = new Set<string>();

  return nodes.filter((node) => {
    const nodeId = typeof node["@id"] === "string" ? node["@id"] : null;
    if (!nodeId) {
      return true;
    }

    if (seenIds.has(nodeId)) {
      return false;
    }

    seenIds.add(nodeId);
    return true;
  });
}
