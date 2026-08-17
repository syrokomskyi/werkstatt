/*
<MODULE_CONTRACT>
<purpose>Builds the JSON-LD ItemList node for "collection"-typed pages (RFC-0490 pillar hub).</purpose>
<non-goals>
  <item>Do not build per-item Product or Service nodes — the ItemList references page URLs only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0490: initial — ItemList node for collection-typed pillar hub pages.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

export function buildCollectionListNode(context: JsonLdContext): JsonLdNode | null {
  const { page, collectionListId } = context;
  if (!collectionListId || !page.collectionItems?.length) return null;

  return {
    "@type": "ItemList",
    "@id": collectionListId,
    itemListElement: page.collectionItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: item.url,
      name: item.name,
    })),
  };
}
