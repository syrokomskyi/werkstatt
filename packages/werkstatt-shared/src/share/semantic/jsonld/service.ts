/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/service.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate service input data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Service JSON-LD generation.</item>
  <item>Moved from app semantic/jsonld/service to packages/share.</item>
  <item>RFC-0498: extend buildServiceNodes to gate Service emission by per-depth policy for all surface depths (website-local depth-1, website-service depth-1, website-local depth-5).</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";
import type { SemanticService } from "../models.ts";

function buildServiceNode(context: JsonLdContext, service: SemanticService): JsonLdNode {
  const { ids } = context;

  return {
    "@type": "Service",
    "@id": ids.service(service.name),
    name: service.name,
    ...(service.description ? { description: service.description } : {}),
    provider: { "@id": ids.organization },
  };
}

/**
 * RFC-0492: build the industry-specific Service node for depth-1 `website-local` pages.
 * Replaces the organization-level Service nodes with a single node carrying
 * `serviceType`, `audience`, and `provider`.
 */
function buildIndustryServiceNode(context: JsonLdContext): JsonLdNode | null {
  const { page, ids } = context;
  if (!page.industryService) return null;

  return {
    "@type": "Service",
    "@id": `${ids.organization}/service-industry`,
    name: page.industryService.serviceType,
    serviceType: page.industryService.serviceType,
    provider: { "@id": ids.organization },
    ...(page.industryService.audience
      ? { audience: { "@type": "Audience", name: page.industryService.audience } }
      : {}),
    ...(page.industryService.description ? { description: page.industryService.description } : {}),
    ...(page.industryService.areaServed
      ? { areaServed: { "@type": "City", name: page.industryService.areaServed } }
      : {}),
  };
}

/**
 * RFC-0492/RFC-0498: for surface pages where Service is required (website-local depth-1,
 * website-service depth-1, website-local depth-5), suppress organization-level Service nodes
 * and emit a single industry-specific Service node instead.
 * For surface pages where Service is prohibited (depth-0, 2, 3, 4), emit no Service nodes.
 * For non-surface pages, emit organization-level Service nodes as before.
 */
export function buildServiceNodes(context: JsonLdContext): JsonLdNode[] {
  const { page } = context;

  // RFC-0498: surface pages with industryService get the industry-specific Service node.
  // This covers website-local depth-1, website-service depth-1, and website-local depth-5.
  if (page.industryService) {
    const industryNode = buildIndustryServiceNode(context);
    return industryNode ? [industryNode] : [];
  }

  // RFC-0498: surface pages without industryService and where Service is prohibited emit no Service nodes.
  // Depth-0, 2, 3, 4 in website-local have Service in prohibitedTypes.
  if (page.surfaceId && page.depth !== undefined && page.depth !== 1 && page.depth !== 5) {
    return [];
  }

  return (page.organization.services ?? []).map((service) => buildServiceNode(context, service));
}
