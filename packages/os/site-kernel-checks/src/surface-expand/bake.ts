/*
<MODULE_CONTRACT>
<purpose>
[RFC-0193/0207] bakePage: builds a visually complete, block-declarative page for one live
VirtualRouteEntry. Axis-generic and field-presence-driven — every present record field maps
to its own block; absent fields omit their block. A deterministic tuple-hash variant rotates
the secondary CTA and a couple of section orders so sibling pages are not byte-identical.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of surface-expand.ts (Phase 3 file-size split).</item>
  <item>RFC-0494: depth-4 city specialization — uniqueIntro hero lead, uniqueFaq md blocks, localEvidence listCards block.</item>
  <item>RFC-0496: website-service depth-2 service dossier specialization; industry-to-service cross-linking block in website-local depth-1.</item>
  <item>RFC-0497: depth-5 intersection specialization — emits only intersection-specific blocks from intersection records.</item>
  <item>RFC-0500: ratgeber depth-0 hub and depth-1 article specializations; supplementaryCollections field on BakeCtx.</item>
</CHANGE_SUMMARY>
*/

import type {
  BlueprintLevel,
  BlueprintPillar,
  SurfaceNarrative,
  VirtualRouteEntry,
} from "@warpgogol/surface";
import type { PageEntry } from "@warpgogol/surface";
import {
  type Block,
  md,
  hero,
  cardGrid,
  listCards,
  linkedCardGrid,
  ctaBlock,
} from "./bake-blocks.ts";
import { bakeRatgeberHub } from "./bake-ratgeber-hub.ts";
import { bakeRatgeberArticle } from "./bake-ratgeber-article.ts";
import {
  variantFor,
  childrenOf,
  siblingsOf,
  skipSingletonChildren,
  labelsFor,
  valData,
  resolveTemplate,
  titleForEntry,
  firstString,
  firstArray,
  hrefFor,
  teaserDesc,
  pickImage,
  teaserImage,
  objectList,
  titledList,
  stringList,
  localFactList,
  citySpecificQaList,
  uniqueFaqList,
  localEvidenceList,
  pillarFor,
  pillarLang,
  taxonomyList,
  journeyList,
  architectureList,
  moduleList,
  serviceVariantList,
  bookingRequirementList,
  pageStructureList,
  type FaqLike,
} from "./bake-helpers.ts";

export type { Block };

export interface BakeCtx {
  /** lang → axisId → (value slug → that value's content frontmatter). */
  axisDataByLang: Map<string, Map<string, Map<string, Record<string, unknown>>>>;
  /** pageId → matching source records from the Blueprint dataset. */
  recordsByPageId: Map<string, Array<Record<string, unknown>>>;
  defaultLang: string;
  entries: readonly VirtualRouteEntry[];
  axisOrder: readonly string[];
  levels: readonly BlueprintLevel[];
  /** RFC-0207: approved bespoke narrative per `${lang}|${pageId}` (empty ⇒ deterministic compose). */
  narratives: Map<string, SurfaceNarrative>;
  /** RFC-0497: intersection records keyed by `${industryId}::${cityId}::${serviceId}`. */
  intersectionsByTuple?: Map<string, Record<string, unknown>>;
  /** RFC-0500: supplementary content collections keyed by collection name, then lang → (slug → data). */
  supplementaryCollections?: Map<string, Map<string, Map<string, Record<string, unknown>>>>;
}

/**
 * RFC-0207: a signature of a baked page's core, language-bearing content — title + the hero's
 * heading, tagline, and lead description. CTA/section labels are excluded, so two languages match
 * only when the actual content (not just the chrome) fell back to the default language. Drives the
 * untranslated-language gate.
 */
/**
 * RFC-0325: the deterministic prose slug for an "article"-typed level's body — no dataset field
 * needed. A depth-0 pillar hub (no axis tuple) uses `<surfaceId>-index`; a record-bound depth
 * uses its stable pageId with `:` normalized to `-` (e.g. "ratgeber:website-kosten" →
 * "ratgeber-website-kosten").
 */
export function articleProseSlug(entry: VirtualRouteEntry): string {
  return entry.depth === 0 ? `${entry.surfaceId}-index` : entry.pageId.replace(/:/g, "-");
}

export function heroSignature(page: PageEntry): string {
  const heroBlock = page.blocks.find((b) => b.type === "hero");
  const props = (heroBlock?.props ?? {}) as Record<string, unknown>;
  const header = (props.header ?? {}) as Record<string, unknown>;
  const heading = typeof header.heading === "string" ? header.heading : "";
  const tagline = typeof props.tagline === "string" ? props.tagline : "";
  const description = typeof props.description === "string" ? props.description : "";
  return [page.title, heading, tagline, description].join(" ");
}

/**
 * RFC-0490: bake the depth-0 pillar hub page — a five-block layout (hero, adaptation,
 * industry catalog, product/price, final CTA) driven by the blueprint `pillar` block.
 * Returns null when the level has no pillar configuration (caller falls back to generic bake).
 */
function bakePillarHub(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
  pillar: BlueprintPillar,
): VirtualRouteEntry["page"] {
  const dl = ctx.defaultLang;
  const p = pillar;

  // 1. Hero — eyebrow as tagline, primary CTA targets #industry-catalog anchor.
  const heroBlock = hero({
    heading: pillarLang(p.hero.heading, lang, dl),
    tagline: pillarLang(p.hero.eyebrow, lang, dl),
    description: pillarLang(p.hero.lead, lang, dl),
    primaryLabel: pillarLang(p.hero.primaryCta.label, lang, dl),
    primaryTarget: p.hero.primaryCta.target,
    secondaryLabel: pillarLang(p.hero.secondaryCta.label, lang, dl),
    secondaryTarget: p.hero.secondaryCta.target,
  });

  // 2. Adaptation — markdown block with dimensions as body subsections.
  const adaptationBody = p.adaptation.dimensions
    .map((d) => `### ${pillarLang(d.heading, lang, dl)}\n\n${pillarLang(d.body, lang, dl)}`)
    .join("\n\n");
  const adaptationBlock = md(pillarLang(p.adaptation.heading, lang, dl), "", adaptationBody);

  // 3. Industry catalog — linked cards from all published depth-1 children.
  const industryCards = childrenOf(entry, ctx.entries, ctx.axisOrder)
    .filter((e) => e.indexable && !e.noindex)
    .map((child) => {
      const industrySlug = child.axes["industry"];
      const data = industrySlug ? valData(ctx, "industry", industrySlug, lang) : undefined;
      const name = (data?.name as string | undefined) ?? titleForEntry(child, ctx, lang);
      const description =
        (data?.metaDescription as string | undefined) ?? teaserDesc(child, ctx, lang);
      const image = data?.image as string | undefined;
      const imageAlt = data?.imageAlt as string | undefined;
      return {
        title: name,
        ...(description ? { description } : {}),
        href: hrefFor(child, lang, dl),
        ...(image ? { image, imageAlt: imageAlt ?? "" } : {}),
      };
    });
  const catalogBlock = linkedCardGrid(
    pillarLang(p.adaptation.heading, lang, dl),
    industryCards,
    "industry-catalog",
  );

  // 4. Product/price — markdown block with PBP price reference interpolation.
  const priceBody = `${pillarLang(p.productPrice.body, lang, dl)}\n\n${p.productPrice.priceRef}`;
  const priceBlock = md(pillarLang(p.productPrice.heading, lang, dl), "", priceBody);

  // 5. Final CTA.
  const finalCtaBlock = ctaBlock(pillarLang(p.finalCta.heading, lang, dl), [
    {
      label: pillarLang(p.finalCta.primaryCta.label, lang, dl),
      pageId: p.finalCta.primaryCta.target,
      variant: "primary",
    },
    {
      label: pillarLang(p.finalCta.secondaryCta.label, lang, dl),
      pageId: p.finalCta.secondaryCta.target,
      variant: "secondary",
    },
  ]);

  const title = pillarLang(p.hero.heading, lang, dl);
  const description = pillarLang(p.hero.lead, lang, dl);

  const blocks: Block[] = [heroBlock, adaptationBlock, catalogBlock, priceBlock, finalCtaBlock];

  return { kind: "page", cosmicStar: "Vega", title, description, lang, blocks: blocks as never };
}

/**
 * RFC-0492: bake the depth-1 industry dossier page for `website-local`. Emits blocks in the
 * order: hero → questions → journeys → taxonomy → trust → evidence → service area →
 * architecture → modules → contact → FAQ → related links → closing CTA.
 * Absent fields omit their block (field-presence-driven, same as the generic baker).
 * Falls back to deprecated fields (specialFocus, scenarioSnippets, painPoints, proofSignals, faqs)
 * when the new dossier fields are absent.
 */
function bakeIndustryDossier(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
): VirtualRouteEntry["page"] {
  const lbl = labelsFor(lang);
  const level = ctx.levels.find((l) => l.depth === entry.depth);
  const narrative = ctx.narratives.get(`${lang}|${entry.pageId}`);

  // Axis-value content (for `lang`, with default-language fallback).
  const valuesDeepFirst = ctx.axisOrder
    .slice(0, entry.depth)
    .map((a) => valData(ctx, a, entry.axes[a], lang))
    .reverse()
    .filter((d): d is Record<string, unknown> => Boolean(d));

  // H1 + hero slots.
  const title = narrative?.h1 ?? titleForEntry(entry, ctx, lang);
  const lead =
    narrative?.lead ??
    firstString(valuesDeepFirst.map((d) => d.heroLead)) ??
    firstString(valuesDeepFirst.map((d) => d.intro)) ??
    firstString(valuesDeepFirst.map((d) => d.localIntro)) ??
    level?.intro?.[lang] ??
    level?.intro?.[ctx.defaultLang] ??
    "";
  let tagline =
    narrative?.tagline ??
    firstString(valuesDeepFirst.map((d) => d.heroIntro)) ??
    firstString(valuesDeepFirst.map((d) => d.tagline));
  if (tagline && tagline === lead) tagline = undefined;

  const descTpl =
    level?.descriptionTemplate?.[lang] ?? level?.descriptionTemplate?.[ctx.defaultLang];
  const description =
    (descTpl ? resolveTemplate(descTpl, entry, ctx, lang) : undefined) ??
    firstString(valuesDeepFirst.map((d) => d.metaDescription)) ??
    (lead || `${title}.`);

  const leadImage = pickImage(valuesDeepFirst);

  // RFC-0492: conditional Notausgang CTA — only when notdienst: true on the industry record.
  const notdienst = valuesDeepFirst.some((d) => d.notdienst === true);
  const secondary = notdienst ? { secondaryLabel: lbl.exit, secondaryTarget: "notausgang" } : {};

  const blocks: Block[] = [];

  // 1. Hero.
  blocks.push(
    hero({
      heading: title,
      ...(tagline ? { tagline } : {}),
      ...(lead ? { description: lead } : {}),
      ...(leadImage ? { leadImage } : {}),
      primaryLabel: lbl.cta,
      primaryTarget: "contact",
      ...secondary,
    }),
  );

  // RFC-0325: article prose block (same as generic baker).
  if (level?.semanticType === "article") {
    blocks.push({
      type: "markdown",
      props: { contentRef: `prose/${articleProseSlug(entry)}`, hideSectionNumber: true },
    });
  }

  // Bespoke connective prose.
  for (const b of narrative?.bridges ?? []) blocks.push(md(b.heading, b.body));

  // 2. Customer questions — cardGrid. Falls back to deprecated specialFocus/scenarioSnippets.
  const questions = stringList(valuesDeepFirst, "customerQuestions");
  const questionsBlock = questions.length
    ? cardGrid(
        lbl.focus,
        questions.map((q) => ({ title: q })),
      )
    : (() => {
        const fallback = titledList(valuesDeepFirst, "specialFocus");
        const fallback2 = titledList(valuesDeepFirst, "scenarioSnippets");
        return fallback.length
          ? cardGrid(lbl.focus, fallback)
          : fallback2.length
            ? cardGrid(lbl.scenarios, fallback2)
            : null;
      })();
  if (questionsBlock) blocks.push(questionsBlock);

  // 3. Customer journeys — cardGrid.
  const journeys = journeyList(valuesDeepFirst, "customerJourneys");
  if (journeys.length) blocks.push(cardGrid(lbl.scenarios, journeys));

  // 4. Service taxonomy — cardGrid.
  const taxonomy = taxonomyList(valuesDeepFirst, "serviceTaxonomy");
  if (taxonomy.length) blocks.push(cardGrid(lbl.focus, taxonomy));

  // 5. Trust signals — listCards. Falls back to deprecated proofSignals.
  const trustSignals = stringList(valuesDeepFirst, "trustSignals");
  const trustFallback = stringList(valuesDeepFirst, "proofSignals");
  const trustBlock = trustSignals.length
    ? listCards(lbl.trust, trustSignals)
    : trustFallback.length
      ? listCards(lbl.trust, trustFallback)
      : null;
  if (trustBlock) blocks.push(trustBlock);

  // 6. Evidence requirements — listCards.
  const evidenceReqs = stringList(valuesDeepFirst, "evidenceRequirements");
  if (evidenceReqs.length) blocks.push(listCards(lbl.trust, evidenceReqs));

  // 7. Service area model — md block.
  const serviceArea = firstString(valuesDeepFirst.map((d) => d.serviceAreaModel));
  if (serviceArea) blocks.push(md(lbl.practical, serviceArea));

  // 8. Recommended architecture — cardGrid.
  const architecture = architectureList(valuesDeepFirst, "recommendedArchitecture");
  if (architecture.length) blocks.push(cardGrid(lbl.focus, architecture));

  // 9. Suitable modules — cardGrid.
  const modules = moduleList(valuesDeepFirst, "suitableModules");
  if (modules.length) blocks.push(cardGrid(lbl.focus, modules));

  // 10. Contact modes — listCards.
  const contactModes = stringList(valuesDeepFirst, "contactModes");
  if (contactModes.length) blocks.push(listCards(lbl.practical, contactModes));

  // 11. Industry FAQ — md blocks. Falls back to deprecated faqs.
  const industryFaqs = (
    firstArray<FaqLike>(valuesDeepFirst.map((d) => d.industryFaq)) ?? []
  ).filter((f): f is { question: string; answer: string } => Boolean(f.question && f.answer));
  const deprecatedFaqs = (firstArray<FaqLike>(valuesDeepFirst.map((d) => d.faqs)) ?? []).filter(
    (f): f is { question: string; answer: string } => Boolean(f.question && f.answer),
  );
  const faqSource = industryFaqs.length ? industryFaqs : deprecatedFaqs;
  for (const f of faqSource) blocks.push(md(f.question, f.answer));

  // 12. Internal-link teasers (children + siblings) — same as generic baker.
  const toCard = (t: VirtualRouteEntry) => ({
    title: titleForEntry(t, ctx, lang),
    description: teaserDesc(t, ctx, lang),
    href: hrefFor(t, lang, ctx.defaultLang),
    ...(teaserImage(t, ctx, lang) ?? {}),
  });
  const childCards = skipSingletonChildren(entry, ctx.entries, ctx.axisOrder)
    .slice(0, 6)
    .map(toCard);
  const siblingCards = siblingsOf(entry, ctx.entries, ctx.axisOrder).slice(0, 6).map(toCard);
  if (childCards.length) blocks.push(linkedCardGrid(lbl.related, childCards));
  if (siblingCards.length) blocks.push(linkedCardGrid(lbl.more, siblingCards));

  // 13. Closing CTA.
  blocks.push(ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }]));

  return { kind: "page", cosmicStar: "Vega", title, description, lang, blocks: blocks as never };
}

/**
 * RFC-0496: bake the depth-2 service dossier page for `website-service`. Emits blocks in the
 * order: hero → purpose → questions → variants → price → duration → booking → consultation →
 * team → portfolio → evidence → architecture → FAQ → closing CTA.
 * Absent fields omit their block (field-presence-driven, same as the generic baker).
 */
function bakeServiceDossier(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
): VirtualRouteEntry["page"] {
  const lbl = labelsFor(lang);
  const level = ctx.levels.find((l) => l.depth === entry.depth);

  // Axis-value content (for `lang`, with default-language fallback).
  const valuesDeepFirst = ctx.axisOrder
    .slice(0, entry.depth)
    .map((a) => valData(ctx, a, entry.axes[a], lang))
    .reverse()
    .filter((d): d is Record<string, unknown> => Boolean(d));

  // The service record is the deepest axis value (service axis).
  const serviceData = valuesDeepFirst[0] ?? {};

  const title =
    (typeof serviceData.name === "string" && serviceData.name) || titleForEntry(entry, ctx, lang);
  const lead =
    ((typeof serviceData.summary === "string" && serviceData.summary) ||
      firstString(valuesDeepFirst.map((d) => d.intro)) ||
      level?.intro?.[lang]) ??
    level?.intro?.[ctx.defaultLang] ??
    "";
  const purpose =
    (typeof serviceData.servicePurpose === "string" && serviceData.servicePurpose) || undefined;

  const descTpl =
    level?.descriptionTemplate?.[lang] ?? level?.descriptionTemplate?.[ctx.defaultLang];
  const description =
    (descTpl ? resolveTemplate(descTpl, entry, ctx, lang) : undefined) ??
    (typeof serviceData.metaDescription === "string" ? serviceData.metaDescription : undefined) ??
    (lead || `${title}.`);

  const blocks: Block[] = [];

  // 1. Hero.
  blocks.push(
    hero({
      heading: title,
      ...(purpose ? { tagline: purpose } : {}),
      ...(lead ? { description: lead } : {}),
      primaryLabel: lbl.cta,
      primaryTarget: "contact",
    }),
  );

  // 2. Service purpose — md block.
  if (purpose) blocks.push(md(lbl.focus, purpose));

  // 3. Customer questions — cardGrid.
  const questions = stringList(valuesDeepFirst, "customerQuestions");
  if (questions.length)
    blocks.push(
      cardGrid(
        lbl.focus,
        questions.map((q) => ({ title: q })),
      ),
    );

  // 4. Service variants — cardGrid.
  const variants = serviceVariantList(valuesDeepFirst, "serviceVariants");
  if (variants.length) blocks.push(cardGrid(lbl.scenarios, variants));

  // 5. Price presentation models — listCards.
  const priceModels = stringList(valuesDeepFirst, "pricePresentationModels");
  if (priceModels.length) blocks.push(listCards(lbl.practical, priceModels));

  // 6. Duration presentation — listCards.
  const durationModels = stringList(valuesDeepFirst, "durationPresentation");
  if (durationModels.length) blocks.push(listCards(lbl.practical, durationModels));

  // 7. Booking requirements — cardGrid.
  const bookingReqs = bookingRequirementList(valuesDeepFirst, "bookingRequirements");
  if (bookingReqs.length) blocks.push(cardGrid(lbl.focus, bookingReqs));

  // 8. Consultation requirements — md block.
  const consultation = firstString(valuesDeepFirst.map((d) => d.consultationRequirements));
  if (consultation) blocks.push(md(lbl.practical, consultation));

  // 9. Team relation — md block.
  const teamRelation = firstString(valuesDeepFirst.map((d) => d.teamRelation));
  if (teamRelation) blocks.push(md(lbl.trust, teamRelation));

  // 10. Portfolio requirements — md block.
  const portfolioReqs = firstString(valuesDeepFirst.map((d) => d.portfolioRequirements));
  if (portfolioReqs) blocks.push(md(lbl.trust, portfolioReqs));

  // 11. Evidence requirements — listCards.
  const evidenceReqs = stringList(valuesDeepFirst, "evidenceRequirements");
  if (evidenceReqs.length) blocks.push(listCards(lbl.trust, evidenceReqs));

  // 12. Recommended page structure — cardGrid.
  const pageStructure = pageStructureList(valuesDeepFirst, "recommendedPageStructure");
  if (pageStructure.length) blocks.push(cardGrid(lbl.focus, pageStructure));

  // 13. FAQ — md blocks.
  const serviceFaqs = (firstArray<FaqLike>(valuesDeepFirst.map((d) => d.faq)) ?? []).filter(
    (f): f is { question: string; answer: string } => Boolean(f.question && f.answer),
  );
  for (const f of serviceFaqs) blocks.push(md(f.question, f.answer));

  // 14. Closing CTA.
  blocks.push(ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }]));

  return { kind: "page", cosmicStar: "Vega", title, description, lang, blocks: blocks as never };
}

/**
 * RFC-0497: bake the depth-5 intersection page for `website-local`. Emits only intersection-specific
 * blocks from the intersection record: hero → questions (cardGrid) → constraints (listCards) →
 * booking context (md) → evidence (md) → unique content blocks (md) → closing CTA.
 * Absent fields omit their block (field-presence-driven, same as the generic baker).
 * Does NOT render demand record fields or inherited prose from parent pages.
 */
function bakeIntersection(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
): VirtualRouteEntry["page"] {
  const lbl = labelsFor(lang);
  const level = ctx.levels.find((l) => l.depth === entry.depth);
  const industry = entry.axes.industry;
  const city = entry.axes.city;
  const demand = entry.axes.demand;
  if (!industry || !city || !demand) return undefined;

  const tupleKey = `${industry}::${city}::${demand}`;
  const intersectionData = ctx.intersectionsByTuple?.get(tupleKey);
  if (!intersectionData) return undefined;

  const titleTemplate =
    level?.titleTemplate?.[lang] ?? level?.titleTemplate?.[ctx.defaultLang] ?? "";
  const title = titleTemplate ? resolveTemplate(titleTemplate, entry, ctx, lang) : entry.pageId;
  const descTemplate =
    level?.descriptionTemplate?.[lang] ?? level?.descriptionTemplate?.[ctx.defaultLang] ?? "";
  const description = descTemplate ? resolveTemplate(descTemplate, entry, ctx, lang) : "";

  const blocks: Block[] = [];

  // 1. Hero — intersection-specific heading and lead from the intersection record.
  const heroHeading =
    (typeof intersectionData.heroHeading === "string" && intersectionData.heroHeading) || title;
  const heroLead =
    typeof intersectionData.heroLead === "string" ? intersectionData.heroLead : undefined;
  const heroTagline =
    typeof intersectionData.heroTagline === "string" ? intersectionData.heroTagline : undefined;
  blocks.push(
    hero({
      heading: heroHeading,
      tagline: heroTagline,
      description: heroLead,
      primaryLabel: lbl.cta,
      primaryTarget: "contact",
    }),
  );

  // 2. Local service questions (cardGrid).
  const questions = firstArray<{ question: string; answer: string }>([
    intersectionData.localServiceQuestions as
      Array<{ question: string; answer: string }> | undefined,
  ]);
  if (questions && questions.length > 0) {
    blocks.push(
      cardGrid(
        lbl.questions,
        questions
          .filter((q) => q.question && q.answer)
          .map((q) => ({ title: q.question, body: q.answer })),
      ),
    );
  }

  // 3. Local service constraints (listCards).
  const constraints = firstArray<{ title: string; description: string }>([
    intersectionData.localServiceConstraints as
      Array<{ title: string; description: string }> | undefined,
  ]);
  if (constraints && constraints.length > 0) {
    blocks.push(
      cardGrid(
        lbl.constraints,
        constraints
          .filter((c) => c.title && c.description)
          .map((c) => ({ title: c.title, description: c.description })),
      ),
    );
  }

  // 4. Local booking context (md).
  if (
    typeof intersectionData.localBookingContext === "string" &&
    intersectionData.localBookingContext
  ) {
    blocks.push(md(lbl.bookingContext, intersectionData.localBookingContext));
  }

  // 5. Local evidence (md).
  if (typeof intersectionData.localEvidence === "string" && intersectionData.localEvidence) {
    blocks.push(md(lbl.evidence, intersectionData.localEvidence));
  }

  // 6. Unique content blocks (md).
  if (
    typeof intersectionData.uniqueContentBlocks === "string" &&
    intersectionData.uniqueContentBlocks
  ) {
    blocks.push(md(lbl.uniqueContent, intersectionData.uniqueContentBlocks));
  }

  // 7. Closing CTA.
  blocks.push(ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }]));

  return { kind: "page", cosmicStar: "Vega", title, description, lang, blocks: blocks as never };
}

/**
 * RFC-0193/0207: bake a visually complete, block-declarative page for one live entry. Axis-generic
 * and field-presence-driven: the hero draws the approved bespoke narrative (h1/lead/tagline) — or, in
 * its absence, distinct record fields per slot (heroLead/heroIntro/intro) so the lead, the tagline,
 * and the body are never the same string — plus a lead image. Every present record field maps to its
 * own block (focus cards, decision/pitfall/trust/practical lists, scenarios, FAQ); absent fields omit
 * their block. Internal-link teasers carry the target's image. A deterministic tuple-hash variant
 * rotates the secondary CTA + a couple of section orders so siblings are not byte-identical.
 */
export function bakePage(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
): VirtualRouteEntry["page"] {
  // RFC-0500: ratgeber depth-0 editorial knowledge hub specialization.
  if (entry.surfaceId === "ratgeber" && entry.depth === 0) {
    return bakeRatgeberHub(entry, lang, ctx);
  }

  // RFC-0500: ratgeber depth-1 article specialization.
  if (entry.surfaceId === "ratgeber" && entry.depth === 1) {
    return bakeRatgeberArticle(entry, lang, ctx);
  }

  // RFC-0490: depth-0 pillar hub specialization.
  if (entry.depth === 0) {
    const pillar = pillarFor(ctx, 0, lang);
    if (pillar) return bakePillarHub(entry, lang, ctx, pillar);
  }

  // RFC-0492: depth-1 website-local industry dossier specialization.
  if (entry.surfaceId === "website-local" && entry.depth === 1) {
    return bakeIndustryDossier(entry, lang, ctx);
  }

  // RFC-0496: depth-2 website-service service dossier specialization.
  if (entry.surfaceId === "website-service" && entry.depth === 2) {
    return bakeServiceDossier(entry, lang, ctx);
  }

  // RFC-0497: depth-5 website-local intersection specialization.
  const level5 = ctx.levels.find((l) => l.depth === entry.depth);
  if (entry.surfaceId === "website-local" && entry.depth === 5 && level5?.intersection) {
    return bakeIntersection(entry, lang, ctx);
  }

  const v = variantFor(entry.pageId, 3);
  const lbl = labelsFor(lang);
  const level = ctx.levels.find((l) => l.depth === entry.depth);
  const narrative = ctx.narratives.get(`${lang}|${entry.pageId}`);

  // Axis-value content (for `lang`, with default-language fallback), deepest axis first.
  const valuesDeepFirst = ctx.axisOrder
    .slice(0, entry.depth)
    .map((a) => valData(ctx, a, entry.axes[a], lang))
    .reverse()
    .filter((d): d is Record<string, unknown> => Boolean(d));
  const recordValues =
    lang === ctx.defaultLang && typeof entry.axes.city === "string"
      ? (ctx.recordsByPageId.get(entry.pageId) ?? [])
      : [];

  // H1: the bespoke narrative heading, else the level title (template/names) — never a glued label.
  const title = narrative?.h1 ?? titleForEntry(entry, ctx, lang);

  // Distinct hero slots. lead = the main paragraph; tagline = a short punch line. Sourced from
  // different fields and never duplicated; if tagline would equal lead it is dropped.
  // RFC-0494: uniqueIntro (city content) takes priority over demand-record heroLead.
  const lead =
    narrative?.lead ??
    firstString(valuesDeepFirst.map((d) => d.uniqueIntro)) ??
    firstString(valuesDeepFirst.map((d) => d.heroLead)) ??
    firstString(valuesDeepFirst.map((d) => d.intro)) ??
    firstString(valuesDeepFirst.map((d) => d.localIntro)) ??
    level?.intro?.[lang] ??
    level?.intro?.[ctx.defaultLang] ??
    "";
  let tagline =
    narrative?.tagline ??
    firstString(valuesDeepFirst.map((d) => d.heroIntro)) ??
    firstString(valuesDeepFirst.map((d) => d.tagline));
  if (tagline && tagline === lead) tagline = undefined;

  // Meta description: an explicit template/metaDescription, else the lead, else the title.
  const descTpl =
    level?.descriptionTemplate?.[lang] ?? level?.descriptionTemplate?.[ctx.defaultLang];
  const description =
    (descTpl ? resolveTemplate(descTpl, entry, ctx, lang) : undefined) ??
    firstString(valuesDeepFirst.map((d) => d.metaDescription)) ??
    (lead || `${title}.`);

  const leadImage = pickImage(valuesDeepFirst);
  const localNote = firstString(valuesDeepFirst.map((d) => d.localNote));

  // Field-driven content (only blocks whose source field exists).
  const focus = titledList(valuesDeepFirst, "specialFocus");
  const sections = objectList(valuesDeepFirst, "sections"); // thin-record fallback for focus
  const scenarios = titledList(valuesDeepFirst, "scenarioSnippets");
  const decisionFactors = stringList(valuesDeepFirst, "decisionFactors");
  const pitfalls = [
    ...stringList(valuesDeepFirst, "localPainPoints"),
    ...stringList(valuesDeepFirst, "painPoints"),
  ];
  const trustCues = stringList(valuesDeepFirst, "localTrustCues");
  const practical = stringList(valuesDeepFirst, "regionNotes");
  const localFacts = localFactList(recordValues, lang);
  const citySpecificQa = citySpecificQaList(recordValues);
  const uniqueFaq = uniqueFaqList(valuesDeepFirst);
  const localEvidence = localEvidenceList(valuesDeepFirst);
  const faqs = (firstArray<FaqLike>(valuesDeepFirst.map((d) => d.faqs)) ?? []).filter(
    (f): f is { question: string; answer: string } => Boolean(f.question && f.answer),
  );

  const secondary = v !== 1 ? { secondaryLabel: lbl.exit, secondaryTarget: "notausgang" } : {};
  const blocks: Block[] = [];

  blocks.push(
    hero({
      heading: title,
      ...(tagline ? { tagline } : {}),
      ...(lead ? { description: lead } : {}),
      ...(leadImage ? { leadImage } : {}),
      primaryLabel: lbl.cta,
      primaryTarget: "contact",
      ...secondary,
    }),
  );

  // RFC-0325: an "article"-typed level carries its substantive body as authored prose
  // (src/content/prose/{lang}/), referenced by a deterministic slug so no extra dataset field is
  // needed. Pushed first (right after the hero, before any FAQ-style `md()` blocks) so it is the
  // page's first `type: "markdown"` block — the one build-page.ts's `extractMarkdownProps` reads
  // for the semantic model's prose body. No heading/lead here: the hero already carries the H1/lead.
  if (level?.semanticType === "article") {
    blocks.push({
      type: "markdown",
      props: { contentRef: `prose/${articleProseSlug(entry)}`, hideSectionNumber: true },
    });
  }

  // Bespoke connective prose woven between the data blocks.
  for (const b of narrative?.bridges ?? []) blocks.push(md(b.heading, b.body));

  // A local-context note (distinct from the hero lead).
  if (localNote) blocks.push(md(lbl.localContext, localNote));

  const focusBlock = focus.length
    ? cardGrid(lbl.focus, focus)
    : sections.length
      ? cardGrid(
          lbl.focus,
          sections.map((s) => ({ title: s.heading, description: s.body })),
        )
      : null;
  const decisionBlock = decisionFactors.length ? listCards(lbl.decision, decisionFactors) : null;
  const scenariosBlock = scenarios.length ? cardGrid(lbl.scenarios, scenarios) : null;
  const pitfallsBlock = pitfalls.length ? listCards(lbl.pitfalls, pitfalls) : null;
  const trustBlock = trustCues.length ? listCards(lbl.trust, trustCues) : null;
  const practicalBlock = practical.length ? listCards(lbl.practical, practical) : null;
  const localFactBlock = localFacts.length ? listCards(lbl.localFacts, localFacts) : null;
  const localEvidenceBlock = localEvidence.length ? listCards(lbl.localFacts, localEvidence) : null;
  const citySpecificQaBlocks = citySpecificQa.map((item) => md(item.question, item.answer));
  const uniqueFaqBlocks = uniqueFaq.map((item) => md(item.question, item.answer));
  const faqBlocks = faqs.map((f) => md(f.question, f.answer));

  // Order: focus + decision are the lead substance; a tuple-hash variant swaps scenarios/pitfalls so
  // sibling pages do not share an identical footprint.
  if (focusBlock) blocks.push(focusBlock);
  if (decisionBlock) blocks.push(decisionBlock);
  if (v === 2) {
    if (pitfallsBlock) blocks.push(pitfallsBlock);
    if (scenariosBlock) blocks.push(scenariosBlock);
  } else {
    if (scenariosBlock) blocks.push(scenariosBlock);
    if (pitfallsBlock) blocks.push(pitfallsBlock);
  }
  if (trustBlock) blocks.push(trustBlock);
  if (practicalBlock) blocks.push(practicalBlock);
  if (localFactBlock) blocks.push(localFactBlock);
  if (localEvidenceBlock) blocks.push(localEvidenceBlock);
  if (citySpecificQaBlocks.length) blocks.push(...citySpecificQaBlocks);
  if (uniqueFaqBlocks.length) blocks.push(...uniqueFaqBlocks);
  if (faqBlocks.length) blocks.push(...faqBlocks);

  // Internal-link teasers (children + siblings) as LINKED, imaged cards, capped for a clean page.
  const toCard = (t: VirtualRouteEntry) => ({
    title: titleForEntry(t, ctx, lang),
    description: teaserDesc(t, ctx, lang),
    href: hrefFor(t, lang, ctx.defaultLang),
    ...(teaserImage(t, ctx, lang) ?? {}),
  });
  // RFC-0238: depth-0 surfaces show industries directly; deeper pages skip singleton geo chains.
  const childCards = (
    entry.depth === 0
      ? childrenOf(entry, ctx.entries, ctx.axisOrder)
      : skipSingletonChildren(entry, ctx.entries, ctx.axisOrder)
  )
    .slice(0, 6)
    .map(toCard);
  const siblingCards = siblingsOf(entry, ctx.entries, ctx.axisOrder).slice(0, 6).map(toCard);
  if (childCards.length) blocks.push(linkedCardGrid(lbl.related, childCards));
  if (siblingCards.length) blocks.push(linkedCardGrid(lbl.more, siblingCards));

  // Closing CTA.
  blocks.push(ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }]));

  return { kind: "page", cosmicStar: "Vega", title, description, lang, blocks: blocks as never };
}
