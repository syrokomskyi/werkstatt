/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: pure, dependency-free formatter that projects a site's Agent Surface
Manifest into an RFC 9727 linkset+json document for /.well-known/api-catalog.
No I/O — the kernel command loads the manifest and passes it here.
</purpose>
<non-goals>
  <item>Do not read files — callers load and pass the manifest.</item>
  <item>Do not sign — signing is a separate concern (agent.surface.sign).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial API Catalog linkset+json projection.</item>
</CHANGE_SUMMARY>
*/

import type { AgentSurfaceManifest } from "./manifest.ts";

/** RFC 9727 linkset+json entry — one per API endpoint or discovery resource. */
export interface ApiCatalogLink {
  href: string;
  rel: string;
  type: string;
  title?: string;
  anchor?: string;
}

/** RFC 9727 linkset document — map of anchor to link array. */
export interface ApiCatalog {
  [anchor: string]: ApiCatalogLink[];
}

/**
 * Pure: project Agent Surface Manifest into RFC 9727 linkset+json.
 * Deterministic — links are sorted by href for byte-identical output (DNA-58).
 */
export function buildApiCatalog(manifest: AgentSurfaceManifest): ApiCatalog {
  const links: ApiCatalogLink[] = [];

  for (const ref of manifest.knowledge) {
    links.push({
      href: ref.url,
      rel: "item",
      type: "application/json",
      title: ref.domain,
    });
  }

  links.push({
    href: "/.well-known/agent.json",
    rel: "service-meta",
    type: "application/json",
  });

  if (manifest.interfaces.openapi) {
    links.push({
      href: manifest.interfaces.openapi,
      rel: "service-desc",
      type: "application/json",
    });
  }

  if (manifest.interfaces.mcp) {
    links.push({
      href: "/.well-known/mcp/server-card.json",
      rel: "service-desc",
      type: "application/json",
    });
    links.push({
      href: manifest.interfaces.mcp.url,
      rel: "service",
      type: "application/json",
    });
  }

  links.push({
    href: manifest.interfaces.llms,
    rel: "service-doc",
    type: "text/plain",
  });

  links.sort((a, b) => a.href.localeCompare(b.href));

  return { "": links };
}
