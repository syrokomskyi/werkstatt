/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/initiative.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate initiative input data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added initiatives list node plus initiative item-position wiring.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

function buildInitiativeNode(
  context: JsonLdContext,
  initiative: { name: string; summary: string },
): JsonLdNode {
  const { ids } = context;

  return {
    "@type": ["Thing", "Project"],
    "@id": ids.initiative(initiative.name),
    name: initiative.name,
    description: initiative.summary,
  };
}

export function buildInitiativeNodes(context: JsonLdContext): JsonLdNode[] {
  return (context.page.initiatives ?? []).map((initiative) =>
    buildInitiativeNode(context, initiative),
  );
}

export function buildInitiativesListNode(context: JsonLdContext): JsonLdNode | null {
  const { page, ids, initiativesListId } = context;

  if (!page.initiatives?.length) {
    return null;
  }

  return {
    "@type": "ItemList",
    "@id": initiativesListId,
    itemListElement: page.initiatives.map((initiative, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: { "@id": ids.initiative(initiative.name) },
      name: initiative.name,
    })),
  };
}
