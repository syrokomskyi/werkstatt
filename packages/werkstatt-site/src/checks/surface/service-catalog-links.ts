/*
<MODULE_CONTRACT>
<purpose>
RFC-0496: post-bake injection of service catalog blocks into website-local depth-1 industry pages.
After all blueprints are expanded, collect website-service entries grouped by industry and inject
a linkedCardGrid block into each industry page's baked pages (all languages).
</purpose>
<non-goals>
  <item>Do not bake service pages — that is the baker's job.</item>
  <item>Do not modify service entries — only industry pages are modified.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0496: initial — service catalog link injection for industry pages.</item>
</CHANGE_SUMMARY>
*/

import type { PageEntry, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";

const SERVICE_CATALOG_LABELS: Record<string, string> = {
  de: "Leistungen",
  uk: "Послуги",
};

/**
 * RFC-0496: inject service catalog blocks into website-local depth-1 industry pages.
 * For each industry page, find all website-service entries with the same industry slug
 * and insert a linkedCardGrid block before the closing CTA.
 */
export function injectServiceCatalogLinks(entries: VirtualRouteEntry[], defaultLang: string): void {
  const serviceEntries = entries.filter(
    (e) => e.surfaceId === "website-service" && e.depth === 1 && e.indexable,
  );

  if (serviceEntries.length === 0) return;

  const industryPages = entries.filter(
    (e) => e.surfaceId === "website-local" && e.depth === 1 && e.indexable && e.pages,
  );

  if (industryPages.length === 0) return;

  const servicesByIndustry = new Map<string, VirtualRouteEntry[]>();
  for (const svc of serviceEntries) {
    const industry = svc.axes["industry"];
    if (!industry) continue;
    const list = servicesByIndustry.get(industry);
    if (list) list.push(svc);
    else servicesByIndustry.set(industry, [svc]);
  }

  for (const industryPage of industryPages) {
    const industry = industryPage.axes["industry"];
    if (!industry) continue;
    const services = servicesByIndustry.get(industry);
    if (!services || services.length === 0) continue;

    for (const [lang, page] of Object.entries(industryPage.pages!)) {
      injectServiceBlock(page, services, lang, defaultLang);
    }

    if (industryPage.page && industryPage.page !== industryPage.pages?.[defaultLang]) {
      injectServiceBlock(industryPage.page, services, defaultLang, defaultLang);
    }
  }
}

function injectServiceBlock(
  page: PageEntry,
  services: VirtualRouteEntry[],
  lang: string,
  defaultLang: string,
): void {
  const label = SERVICE_CATALOG_LABELS[lang] ?? SERVICE_CATALOG_LABELS[defaultLang] ?? "Services";

  const cards = services.map((svc) => {
    const slug = svc.routes[lang] ?? svc.routes[defaultLang] ?? "";
    const prefix = lang === defaultLang ? "" : `${lang}/`;
    const href = `/${prefix}${slug}/`.replace(/\/+/g, "/");
    const svcPage = svc.pages?.[lang] ?? svc.page;
    const title = svcPage?.title ?? slug;
    const description = svcPage?.description;
    return {
      title,
      ...(description ? { description } : {}),
      href,
    };
  });

  const catalogBlock = {
    type: "audience-cards",
    props: {
      header: { heading: label },
      body: {
        kind: "cards",
        columns: cards.length >= 3 ? 3 : 2,
        cards: cards.map((c) => ({
          title: c.title,
          ...(c.description ? { description: c.description } : {}),
          href: c.href,
        })),
      },
    },
  };

  const blocks = page.blocks as unknown as Array<Record<string, unknown>>;
  const ctaIdx = blocks.findIndex((b) => b.type === "final-cta");
  if (ctaIdx >= 0) {
    blocks.splice(ctaIdx, 0, catalogBlock);
  } else {
    blocks.push(catalogBlock);
  }
}
