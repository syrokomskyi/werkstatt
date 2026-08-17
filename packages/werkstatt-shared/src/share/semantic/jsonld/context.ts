/*
<MODULE_CONTRACT>
<purpose>Creates a typed context object for JSON-LD node builders from a SemanticPageModel.</purpose>
<non-goals>
  <item>Do not parse or transform content.</item>
  <item>Do not fetch external data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added servicesListId and initiativesListId derived IDs.</item>
  <item>Moved from app semantic/jsonld/context to packages/share.</item>
</CHANGE_SUMMARY>
*/

import { createSemanticIds } from "../ids.ts";
import type { SemanticPageModel } from "../models.ts";

export type JsonLdContext = {
  page: SemanticPageModel;
  ids: ReturnType<typeof createSemanticIds>;
  webpageId: string;
  breadcrumbId: string;
  initiativesListId: string;
  servicesListId?: string;
  faqPageId?: string;
  collectionListId?: string;
};

export function createJsonLdContext(page: SemanticPageModel): JsonLdContext {
  const ids = createSemanticIds(new URL(page.url).origin);
  const webpageId = ids.webpage(page.url);

  return {
    page,
    ids,
    webpageId,
    breadcrumbId: ids.breadcrumb(page.url),
    initiativesListId: `${webpageId}/initiatives`,
    servicesListId: page.organization.services?.length ? `${ids.organization}/services` : undefined,
    faqPageId: page.faqEntries && page.faqEntries.length > 0 ? ids.faq(page.url) : undefined,
    collectionListId:
      page.type === "collection" && page.collectionItems?.length
        ? `${webpageId}/industries`
        : undefined,
  };
}
