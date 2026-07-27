/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/faq.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate FAQ input data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added FAQPage JSON-LD support.</item>
  <item>Moved from app semantic/jsonld/faq to packages/share.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";
import type { SemanticFaqEntry } from "../models.ts";

function buildQuestionNode(entry: SemanticFaqEntry): JsonLdNode {
  return {
    "@type": "Question",
    name: entry.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: entry.answer,
    },
  };
}

export function buildFaqPageNode(context: JsonLdContext): JsonLdNode | null {
  const entries = context.page.faqEntries;
  if (!entries || entries.length === 0) {
    return null;
  }

  return {
    "@type": "FAQPage",
    "@id": context.faqPageId,
    mainEntity: entries.map((entry) => buildQuestionNode(entry)),
  };
}

export function buildFaqNodes(context: JsonLdContext): JsonLdNode[] {
  // RFC-0506: suppress FAQPage on ratgeber depth-1 article pages.
  if (context.page.surfaceId === "ratgeber" && context.page.depth === 1) {
    return [];
  }
  const faqPage = buildFaqPageNode(context);
  return faqPage ? [faqPage] : [];
}
