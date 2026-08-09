/*
<MODULE_CONTRACT>
<purpose>Astro content-collection factory and loader functions for FAQ entries
(RFC-0475). Sites register the FAQ collection via createFaqCollection() and
query entries via getFaqEntries / getFaqEntriesByTags.</purpose>
<non-goals>
  <item>Does not define the Zod schema — that is schema.ts.</item>
  <item>Does not define JSON-LD or semantic model logic — that lives in @warpgogol/werkstatt-site/share.</item>
  <item>Does not validate FAQ content at build time — that is faq.validate in site-kernel-checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0475: initial implementation — collection factory, loaders, semantic mapping.</item>
  <item>RFC-0567: getFaqEntriesByTags uses orderTags[tags[0]] with fallback to order for per-tag ordering.</item>
</CHANGE_SUMMARY>
*/

import { defineCollection } from "astro:content";
import { fsDataCollectionLoader } from "@warpgogol/werkstatt-site/content-source";
import { toDataEntryId } from "@warpgogol/werkstatt-site/share/content";
import { getCollection } from "@warpgogol/werkstatt-site/content-source/astro";
import type { SemanticFaqEntry } from "@warpgogol/werkstatt-site/share/semantic";
import { faqSchema, type FaqEntry } from "./schema.ts";

export function createFaqCollection() {
  return {
    faq: defineCollection({
      loader: fsDataCollectionLoader({
        base: "src/content/faq",
        generateId: (entry) => toDataEntryId(entry),
      }),
      schema: faqSchema,
    }),
  };
}

export async function getFaqEntries(lang: string): Promise<FaqEntry[]> {
  const entries = await getCollection("faq", (entry: { id: string; data: FaqEntry }) =>
    entry.id.startsWith(`${lang}/`),
  );
  return entries
    .map((e: { id: string; data: FaqEntry }) => e.data)
    .sort((a: FaqEntry, b: FaqEntry) => (a.order ?? 999) - (b.order ?? 999));
}

export async function getFaqEntriesByTags(lang: string, tags: string[]): Promise<FaqEntry[]> {
  const all = await getFaqEntries(lang);
  const tag = tags[0]; // primary queried tag — caller passes tags in priority order
  return all
    .filter((e) => e.tags?.some((t) => tags.includes(t)))
    .sort((a, b) => {
      const aOrder = a.orderTags?.[tag] ?? a.order ?? 999;
      const bOrder = b.orderTags?.[tag] ?? b.order ?? 999;
      return aOrder - bOrder;
    });
}

export function toSemanticFaqEntries(entries: FaqEntry[]): SemanticFaqEntry[] {
  return entries.map((e) => ({
    id: e.slug,
    question: e.question,
    answer: e.answer,
    tags: e.tags,
  }));
}
