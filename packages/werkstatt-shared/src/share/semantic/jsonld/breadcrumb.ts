/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/breadcrumb.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not parse raw content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added breadcrumb support for JSON-LD generation.</item>
  <item>Moved from app semantic/jsonld/breadcrumb to packages/share.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

export function buildBreadcrumbNode(context: JsonLdContext): JsonLdNode | null {
  const { page, breadcrumbId } = context;

  if (page.breadcrumbs.length <= 1) {
    return null;
  }

  // RFC-0229: trail crumbs carry root-relative paths so the *rendered* links work in any environment.
  // The BreadcrumbList `item` must be an absolute canonical URL, so resolve each crumb against the
  // page's canonical origin (already-absolute crumb URLs pass through unchanged).
  const toAbsolute = (url: string): string => {
    try {
      return new URL(url, page.url).toString();
    } catch {
      return url;
    }
  };

  return {
    "@type": "BreadcrumbList",
    "@id": breadcrumbId,
    itemListElement: page.breadcrumbs.map((item, index) => ({
      "@type": "ListItem",
      // RFC-0229: stable, position-scoped @id so each crumb is an addressable node in the page graph.
      "@id": `${breadcrumbId}/${index + 1}`,
      position: index + 1,
      name: item.name,
      item: toAbsolute(item.url),
    })),
  };
}
