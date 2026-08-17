/*
<MODULE_CONTRACT>
<purpose>Assembles a complete JSON-LD document from a SemanticPageModel by composing all entity-specific nodes.</purpose>
<non-goals>
  <item>Do not handle raw content parsing.</item>
  <item>Do not manage external API interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added initiative list graph node, breadcrumb fallback, and shared dedupe utility.</item>
</CHANGE_SUMMARY>
*/

import { buildArticleNode } from "./jsonld/article.ts";
import { buildBreadcrumbNode } from "./jsonld/breadcrumb.ts";
import { buildCollectionListNode } from "./jsonld/collection-list.ts";
import { createJsonLdContext } from "./jsonld/context.ts";
import { buildFaqNodes } from "./jsonld/faq.ts";
import { buildInitiativesListNode, buildInitiativeNodes } from "./jsonld/initiative.ts";
import { buildOrganizationNode } from "./jsonld/organization.ts";
import { buildPersonNodes } from "./jsonld/person.ts";
import { buildServiceNodes } from "./jsonld/service.ts";
import { dedupeGraph } from "./jsonld/shared.ts";
import type { JsonLdDocument } from "./jsonld/types.ts";
import { buildWebPageNode } from "./jsonld/webpage.ts";
import { buildWebSiteNode } from "./jsonld/website.ts";
import type { SemanticPageModel } from "./models.ts";

export type { JsonLdDocument } from "./jsonld/types.ts";
export type { JsonLdContext } from "./jsonld/context.ts";

export function buildJsonLd(page: SemanticPageModel): JsonLdDocument {
  const context = createJsonLdContext(page);
  const articleNode = buildArticleNode(context);
  const breadcrumbNode = buildBreadcrumbNode(context);
  const collectionListNode = buildCollectionListNode(context);
  const initiativesListNode = buildInitiativesListNode(context);
  // RFC-0498: suppress the org-level services ItemList for all surface pages.
  // Surface pages emit industry-specific Service nodes (depth-1, website-service, depth-5)
  // or no Service nodes at all (depth-0, 2, 3, 4) — never org-level services.
  const suppressOrgServices = page.surfaceId !== undefined;
  const servicesListNode =
    !suppressOrgServices && context.servicesListId
      ? {
          "@type": "ItemList" as const,
          "@id": context.servicesListId,
          itemListElement: (context.page.organization.services ?? []).map((service, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: { "@id": context.ids.service(service.name) },
            name: service.name,
          })),
        }
      : null;

  return {
    "@context": "https://schema.org",
    "@graph": dedupeGraph([
      buildOrganizationNode(context),
      buildWebSiteNode(context),
      buildWebPageNode(context),
      ...buildPersonNodes(context),
      ...buildServiceNodes(context),
      ...buildFaqNodes(context),
      ...buildInitiativeNodes(context),
      ...(initiativesListNode ? [initiativesListNode] : []),
      ...(servicesListNode ? [servicesListNode] : []),
      ...(collectionListNode ? [collectionListNode] : []),
      ...(articleNode ? [articleNode] : []),
      ...(breadcrumbNode ? [breadcrumbNode] : []),
      // RFC-0512: extra nodes from team profile pages (SoftwareApplication, CollectionPage).
      ...(page.extraGraphNodes ?? []),
    ]),
  };
}
