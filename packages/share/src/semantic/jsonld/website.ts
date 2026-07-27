/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/website.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not parse raw content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added WebSite JSON-LD generation.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

export function buildWebSiteNode(context: JsonLdContext): JsonLdNode {
  const { page, ids } = context;

  return {
    "@type": "WebSite",
    "@id": ids.website,
    url: page.organization.url,
    name: page.organization.name,
    inLanguage: page.lang,
    publisher: { "@id": ids.organization },
  };
}
