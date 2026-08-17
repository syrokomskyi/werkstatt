/*
<MODULE_CONTRACT>
<purpose>RFC-0167: builds the Article/BlogPosting JSON-LD node from a page that carries article
metadata (datePublished/author/…). Gives Google freshness/Discover signals and LLM recency +
attribution that a bare WebPage lacks.</purpose>
<non-goals>
  <item>Do not emit when the page has no datePublished.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0167: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

export function buildArticleNode(context: JsonLdContext): JsonLdNode | null {
  const { page, ids, webpageId } = context;
  if (!page.datePublished) {
    return null;
  }
  const isRatgeberDepth1 = page.surfaceId === "ratgeber" && page.depth === 1;
  const author = page.authorRecord
    ? {
        "@type": "Person",
        name: page.authorRecord.name,
        ...(page.authorRecord.contactUrl ? { url: page.authorRecord.contactUrl } : {}),
      }
    : page.author
      ? { "@type": "Person", name: page.author }
      : undefined;
  return {
    "@type": ["Article", "BlogPosting"],
    "@id": webpageId.replace("#/schema/webpage", "#/schema/article"),
    headline: page.heading ?? page.title,
    description: page.description,
    datePublished: page.datePublished,
    dateModified: page.dateModified ?? page.datePublished,
    ...(author ? { author } : {}),
    publisher: { "@id": ids.organization },
    mainEntityOfPage: isRatgeberDepth1 ? page.url : { "@id": webpageId },
    inLanguage: page.lang,
    ...(page.primaryImage ? { image: page.primaryImage.url } : {}),
    ...(page.keywords?.length ? { keywords: page.keywords.join(", ") } : {}),
  };
}
