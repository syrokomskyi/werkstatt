/*
<MODULE_CONTRACT>
<purpose>[RFC-0192/0193] expandBlueprint: loads a Blueprint's datasets (app src/content/surface/
<collection>/<lang>) via the kernel content loader, runs the axis-generic engine, applies
demand/evidence/freshness/substance-budget gates, and bakes each live page's blocks into the
VirtualRouteEntry.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of surface-expand.ts (Phase 3 file-size split).</item>
  <item>Architecture review 2026-07-10: extract pure pipeline stages to pipeline.ts; expandBlueprint is now an I/O orchestrator that calls stages in order.</item>
  <item>RFC-0494: merge supplementary content collection for geo-provider axes.</item>
  <item>RFC-0497: load intersection records and apply intersection gate to depth-5 entries.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type { KernelRuntimeContext } from "@warpgogol/site-kernel";
import {
  buildAxisFieldMap,
  generateEntries,
  type Blueprint,
  type LocalizedSlug,
  type LocalizedUniverse,
  type SurfaceNarrative,
  type SurfaceRecord,
  type VirtualRouteEntry,
} from "@warpgogol/surface";
import type { PageEntry } from "@warpgogol/surface";
import { toKebabCase } from "@warpgogol/share/string-utils";
import { createGeoService, type GeoProviderResult } from "@warpgogol/geo";
import { loadApprovedEnrichedBulk, loadApprovedNarrativesBulk } from "../surface-enrich.ts";
import {
  loadDemandSignals,
  loadWerkRecords,
  qualifyingDemandSignals,
  qualifyingWerkRecords,
} from "../surface-demand.ts";
import { bakePage, type BakeCtx } from "./bake.ts";
import { loadDataset, blueprintLangs, matchingRecordsForEntry } from "./expand-helpers.ts";
import {
  applyBudgetGate,
  applyEvidenceGates,
  applyExistenceGates,
  applyFreshnessGate,
  applyIntersectionGate,
  applySubstanceGate,
  applyUntranslatedGate,
  dedupByPageId,
  insertStringEnrichedFields,
  type IntersectionRecord,
} from "./pipeline.ts";

async function loadSkylineImages(ctx: {
  appDir: string;
  io?: KernelRuntimeContext["io"];
}): Promise<Set<string>> {
  const assetsDir = join(ctx.appDir, "src", "content", "surface", "assets");
  if (!ctx.io || !(await ctx.io.exists(assetsDir))) return new Set();
  try {
    const entries = await ctx.io.readdir(assetsDir);
    return new Set(
      entries
        .filter((entry) => entry.isFile && entry.name.endsWith("-skyline.webp"))
        .map((entry) => entry.name.replace(/\.webp$/, "")),
    );
  } catch {
    return new Set();
  }
}

/** Expand one Blueprint into materialized virtual route entries with baked pages. */
export async function expandBlueprint(
  blueprint: Blueprint,
  ctx: {
    appDir: string;
    workspaceRoot: string;
    indexBudget?: number;
    /** RFC-0240: whether the resolved entitlements unlock the regional-hub-or-higher `pseo` tier. */
    regionalUnlocked?: boolean;
    defaultLang?: string;
    supportedLangs?: string[];
    io?: KernelRuntimeContext["io"];
  },
): Promise<VirtualRouteEntry[]> {
  const defaultLang = ctx.defaultLang ?? blueprintLangs(blueprint)[0];
  if (!defaultLang) {
    throw new Error(`[surface.expand] Blueprint "${blueprint.id}" has no default language.`);
  }
  // Generate a page per app-supported language. A level that lacks a slug for a language falls back
  // to the default-language slug (lang-prefixed URL); axis-value content falls back per-field too.
  const genLangs = ctx.supportedLangs?.length
    ? ctx.supportedLangs
    : blueprintLangs(blueprint).length
      ? blueprintLangs(blueprint)
      : [defaultLang];

  // Pre-load records so we can derive geo filter values before resolving universes.
  const datasetEntries = await loadDataset(ctx.appDir, blueprint.dataset.collection, defaultLang);
  const records: SurfaceRecord[] = datasetEntries.map((row) => ({
    ...(row.data as Record<string, string | string[] | undefined>),
    slug: row.slug,
    status:
      typeof row.data.status === "string" ? (row.data.status as "active" | "archived") : "active",
  }));

  // Build per-geo-axis filter sets from the actual records so we only enumerate
  // cities/regions/countries that are referenced (cuts ~10K cities down to dozens).
  const geoFilterByAxis = new Map<string, Set<string>>();
  for (const axis of blueprint.axes) {
    if ("provider" in axis.universe) {
      const field = axis.match.recordField;
      const values = new Set<string>();
      for (const record of records) {
        const v = record[field];
        if (Array.isArray(v)) {
          for (const item of v) if (typeof item === "string") values.add(item);
        } else if (typeof v === "string") {
          values.add(v);
        }
      }
      geoFilterByAxis.set(axis.id, values);
    }
  }

  // Axis-generic, per-language loading. The value universe + records (slugs, matching, freshness)
  // are language-neutral and read from the default language; per-language display content (names,
  // intros, sections, faqs) is loaded for each language for the baker (with default-lang fallback).
  // RFC-0238: geo provider axes are resolved from @warpgogol/geo instead of content collections.
  // Architecture review 2026-07-10: single providerEntries call per axis, cached for all 3 phases.
  const geo = createGeoService();
  const skylineImages = await loadSkylineImages(ctx);
  const geoResultByAxis = new Map<string, GeoProviderResult>();
  for (const axis of blueprint.axes) {
    if ("provider" in axis.universe) {
      const filter = geoFilterByAxis.get(axis.id);
      geoResultByAxis.set(
        axis.id,
        geo.providerEntries(axis.universe.provider, genLangs, defaultLang, {
          imageResolver: (neutral) => {
            const token = `${neutral}-skyline`;
            return skylineImages.has(token) ? token : undefined;
          },
          filterValues: filter,
        }),
      );
    }
  }

  const geoLocalizedByAxis = new Map<string, Map<string, LocalizedSlug>>();
  const axisDataByLang = new Map<string, Map<string, Map<string, Record<string, unknown>>>>();
  for (const l of genLangs) {
    const perAxis = new Map<string, Map<string, Record<string, unknown>>>();
    for (const axis of blueprint.axes) {
      if ("provider" in axis.universe) {
        const result = geoResultByAxis.get(axis.id)!;
        const geoMap = new Map(result.entries.map((e) => [e.slug, e.data]));
        // RFC-0494: merge supplementary content collection for geo-provider axes.
        // Derive the collection name from the provider name (e.g. "geo.cities" → "cities"),
        // not from axis.id + "s", because English plurals are irregular.
        const collectionName = axis.universe.provider.split(".").pop()!;
        const contentEntries = await loadDataset(ctx.appDir, collectionName, l);
        for (const ce of contentEntries) {
          const existing = geoMap.get(ce.slug);
          if (existing) {
            geoMap.set(ce.slug, { ...existing, ...ce.data });
          }
        }
        perAxis.set(axis.id, geoMap);
        if (!geoLocalizedByAxis.has(axis.id)) {
          geoLocalizedByAxis.set(axis.id, result.localized);
        }
      } else {
        const es = await loadDataset(ctx.appDir, axis.universe.collection, l);
        perAxis.set(axis.id, new Map(es.map((e) => [e.slug, e.data])));
      }
    }
    axisDataByLang.set(l, perAxis);
  }

  const universes: Record<string, readonly string[]> = {};
  for (const axis of blueprint.axes) {
    if ("provider" in axis.universe) {
      const result = geoResultByAxis.get(axis.id)!;
      universes[axis.id] = result.entries.map((e) => e.slug);
    } else {
      const es = await loadDataset(ctx.appDir, axis.universe.collection, defaultLang);
      universes[axis.id] = es.map((e) => e.slug);
    }
  }

  // RFC-0199: per-language localized slug segments. The neutral slug (default-language filename
  // stem) stays the identity key; a per-language record MAY override its URL segment via a `slug`
  // frontmatter field. Records without one fall back to the neutral slug, so single-language axes
  // and untranslated records are unaffected.
  // RFC-0238: geo provider axes use @warpgogol/geo's locale-aware slugByLang.
  const localizedUniverse: LocalizedUniverse = {};
  for (const axis of blueprint.axes) {
    const map = new Map<string, LocalizedSlug>();
    if ("provider" in axis.universe && geoLocalizedByAxis.has(axis.id)) {
      const geoLocalized = geoLocalizedByAxis.get(axis.id)!;
      for (const [neutral, loc] of geoLocalized) {
        map.set(neutral, loc);
      }
    } else {
      for (const neutral of universes[axis.id] ?? []) {
        const byLang: Record<string, string> = {};
        for (const l of genLangs) {
          if (l === defaultLang) continue;
          const override = axisDataByLang.get(l)?.get(axis.id)?.get(neutral)?.slug;
          if (typeof override === "string" && override.trim() && override !== neutral) {
            byLang[l] = override.trim();
          }
        }
        map.set(neutral, Object.keys(byLang).length ? { neutral, byLang } : { neutral });
      }
    }
    localizedUniverse[axis.id] = map;
  }

  const entries = generateEntries(blueprint, {
    records,
    universes,
    langs: genLangs,
    localizedUniverse,
    regionalUnlocked: ctx.regionalUnlocked,
  });

  // RFC-0238: dedup by pageId so that two geo cities with the same localized slug
  // (e.g. Freiburg im Breisgau and Freiburg in Lower Saxony both → "freiburg")
  // do not emit duplicate virtual route entries.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  const deduped = dedupByPageId(entries);
  entries.splice(0, entries.length, ...deduped);

  // RFC-0280/RFC-0281: demand and Werk evidence can be existence gates, not only
  // post-hoc validators. Shallow hubs still aggregate record descendants; only
  // depths with explicit Blueprint policies are affected.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  const demandPolicies = blueprint.policy.demandPerDepth ?? {};
  const evidencePolicies = blueprint.policy.evidencePerDepth ?? {};
  if (
    Object.keys(demandPolicies).length ||
    Object.values(evidencePolicies).some((policy) => policy.existenceSource === "works")
  ) {
    const demandSignals = await loadDemandSignals(ctx.appDir, defaultLang);
    const works = await loadWerkRecords(ctx.appDir, defaultLang);
    const retained = applyExistenceGates(
      entries,
      qualifyingDemandSignals,
      qualifyingWerkRecords,
      demandPolicies,
      evidencePolicies,
      demandSignals,
      works,
    );
    entries.splice(0, entries.length, ...retained);
  }

  // RFC-0497: intersection gate — depth-5 entries require an approved intersection record.
  // The gate is configured per-level via BlueprintLevel.intersection. Only levels that declare
  // an `intersection` config block are gated.
  const intersectionsByTuple = new Map<string, Record<string, unknown>>();
  for (const level of blueprint.levels) {
    if (!level.intersection) continue;
    const intersectionDepth = level.depth;
    const intersectionRecords: IntersectionRecord[] = [];
    for (const l of genLangs) {
      const dataset = await loadDataset(ctx.appDir, "intersections", l);
      for (const entry of dataset) {
        const data = entry.data;
        if (data.publicationDecision !== "approved") continue;
        intersectionRecords.push({
          intersectionId: String(data.intersectionId ?? entry.slug),
          industryId: String(data.industryId ?? ""),
          cityId: String(data.cityId ?? ""),
          serviceId: String(data.serviceId ?? ""),
          publicationDecision: "approved",
        });
        const industryId = String(data.industryId ?? "");
        const cityId = String(data.cityId ?? "");
        const serviceId = String(data.serviceId ?? "");
        intersectionsByTuple.set(`${industryId}::${cityId}::${serviceId}`, data);
      }
      break;
    }
    const retained = applyIntersectionGate(entries, intersectionRecords, intersectionDepth);
    entries.splice(0, entries.length, ...retained);
    break;
  }

  const axisOrder = blueprint.axes.map((a) => a.id);

  // RFC-0207: load approved bespoke narratives for the narrative-kind enriched fields, keyed
  // `${lang}|${pageId}`. Only entries at the field's scopeDepth are read; unapproved/absent entries
  // are simply omitted (the baker falls back to deterministic field composition).
  const narratives = new Map<string, SurfaceNarrative>();
  const narrativeFields = (blueprint.enrichedFields ?? []).filter((f) => f.kind === "narrative");
  if (narrativeFields.length) {
    const narrativeByLang = new Map<string, Map<string, SurfaceNarrative>>();
    for (const l of genLangs) {
      narrativeByLang.set(l, await loadApprovedNarrativesBulk(ctx.appDir, blueprint.id, l));
    }
    for (const entry of entries) {
      if (!entry.indexable) continue;
      for (const field of narrativeFields) {
        if (field.scopeDepth !== entry.depth) continue;
        for (const l of genLangs) {
          const bulk = narrativeByLang.get(l);
          if (!bulk) continue;
          const key = `${toKebabCase(entry.pageId)}-${toKebabCase(field.field)}`;
          const n = bulk.get(key);
          if (n) narratives.set(`${l}|${entry.pageId}`, n);
        }
      }
    }
  }

  // RFC-0500: load supplementary collections for surfaces that need them (e.g. article-categories for ratgeber hub).
  const supplementaryCollections = new Map<
    string,
    Map<string, Map<string, Record<string, unknown>>>
  >();
  if (blueprint.id === "ratgeber") {
    const catMap = new Map<string, Map<string, Record<string, unknown>>>();
    for (const l of genLangs) {
      const cats = await loadDataset(ctx.appDir, "article-categories", l);
      catMap.set(l, new Map(cats.map((c) => [c.slug, c.data])));
    }
    supplementaryCollections.set("article-categories", catMap);

    // RFC-0502: load author records for provenance footer
    const authorMap = new Map<string, Map<string, Record<string, unknown>>>();
    for (const l of genLangs) {
      const authors = await loadDataset(ctx.appDir, "authors", l);
      authorMap.set(l, new Map(authors.map((a) => [a.slug, a.data])));
    }
    supplementaryCollections.set("authors", authorMap);
  }

  const bakeCtx: BakeCtx = {
    axisDataByLang,
    recordsByPageId: new Map(
      entries.map((entry) => [
        entry.pageId,
        matchingRecordsForEntry(records, entry, buildAxisFieldMap(blueprint)).map((record) => ({
          ...record,
        })),
      ]),
    ),
    defaultLang,
    entries,
    axisOrder,
    levels: blueprint.levels,
    narratives,
    intersectionsByTuple,
    supplementaryCollections,
  };

  // Top-level axis landing pages get an authored-style site background image (resolved from the
  // app's content assets by name, exactly like an authored page's `shell.background` in system.md).
  const axisBackgrounds: Record<string, string> = {
    ratgeber: "ratgeber-bg",
    "website-local": "website-bg",
    offer: "leitung-bg",
  };

  // Bake one page per language. `entry.page` mirrors the default-language page.
  for (const entry of entries) {
    if (!entry.indexable) continue;
    const level = blueprint.levels.find((l) => l.depth === entry.depth);
    entry.semanticType = level?.semanticType ?? "content";
    // RFC-0325: article dates come from the matching dataset record (depth ≥1, record-bound
    // levels) or, absent a record (a depth-0 pillar hub), from the level's static `article`.
    if (entry.semanticType === "article") {
      const record = entry.depth > 0 ? bakeCtx.recordsByPageId.get(entry.pageId)?.[0] : undefined;
      const publishedAt =
        (typeof record?.publishedAt === "string" ? record.publishedAt : undefined) ??
        level?.article?.publishedAt;
      if (publishedAt) {
        const tags = Array.isArray(record?.tags)
          ? (record.tags as unknown[]).filter((t): t is string => typeof t === "string")
          : undefined;
        entry.article = {
          publishedAt,
          updatedAt:
            (typeof record?.updatedAt === "string" ? record.updatedAt : undefined) ??
            level?.article?.updatedAt,
          author:
            (typeof record?.author === "string" ? record.author : undefined) ??
            level?.article?.author,
          tags: tags?.length ? tags : level?.article?.tags,
        };
      }
    }
    if (entry.depth === 0 && axisBackgrounds[entry.surfaceId]) {
      entry.backgroundImage = axisBackgrounds[entry.surfaceId];
    }
    const pages: Record<string, PageEntry> = {};
    for (const l of genLangs) pages[l] = bakePage(entry, l, bakeCtx) as PageEntry;
    entry.pages = pages;
    entry.page = pages[defaultLang];
  }

  // RFC-0207: untranslated-language gate. A non-default language whose baked page fell back to the
  // default language for its core content — identical hero heading + lead + tagline + title — has no
  // native content to offer. Drop its route + page so the de-fallback never renders under a localized
  // URL (and never enters the sitemap/hreflang/twins/llms). Recorded in `untranslatedLangs` for
  // surface.validate. Reversible: supply native record fields (or an approved narrative) and the
  // route reappears on the next generate.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  applyUntranslatedGate(entries, defaultLang, genLangs);

  // RFC-0197/0207: insert approved, frozen LLM-enriched string fields (per language) as ordinary
  // content blocks before the closing CTA. Narrative-kind fields are consumed by the baker
  // (hero/bridges), so only non-narrative fields are inserted here. Iterate the surviving language
  // pages (the untranslated gate above may have dropped some); absent entries omit the block.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  const marketSignalHeading: Record<string, string> = {
    de: "Lokale Marktbeobachtung",
    uk: "Локальний огляд ринку",
  };
  const stringEnrichedFields = (blueprint.enrichedFields ?? []).filter(
    (f) => f.kind !== "narrative",
  );
  if (stringEnrichedFields.length) {
    const enrichedByLang = new Map<string, Map<string, string>>();
    for (const l of genLangs) {
      enrichedByLang.set(l, await loadApprovedEnrichedBulk(ctx.appDir, blueprint.id, l));
    }
    insertStringEnrichedFields(
      entries,
      blueprint,
      enrichedByLang,
      genLangs,
      defaultLang,
      marketSignalHeading,
    );
  }

  // RFC-0194: substance gate. Always score each baked page against the family token baseline and
  // record it in the manifest. Suppression is enforced only when the Blueprint sets substanceMin > 0
  // (substanceMin: 0 ⇒ report-only). A suppressed page is forced to noindex — still rendered, out of
  // the sitemap — regardless of how many records matched it.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  applySubstanceGate(entries, blueprint);

  // RFC-0274: evidence gates are separate from structural substance. A deepest commercial/local
  // page cannot stay indexable only because the template has enough text and links.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  applyEvidenceGates(entries, blueprint, records, narratives, defaultLang);

  // RFC-0196 (N3): Freshness Ledger. A live page whose contributing records are stale past the
  // Blueprint's per-depth SLA decays to noindex (reversible — re-verifying the records restores it).
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  applyFreshnessGate(entries, blueprint, records);

  // RFC-0196 (N2): substance budget = entitlement tier. Keep the top-K indexable pages by substance
  // score; the remainder are noindex ("over-budget"). Fail-open: no budget ⇒ unbounded.
  // Architecture review 2026-07-10: delegated to pure pipeline stage.
  applyBudgetGate(entries, ctx.indexBudget);

  return entries;
}
