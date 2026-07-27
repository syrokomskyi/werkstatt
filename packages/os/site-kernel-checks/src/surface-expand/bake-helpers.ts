/*
<MODULE_CONTRACT>
<purpose>Internal helpers for the surface page baker — rotation, labels, template resolution, field extraction, and live-entry relationship helpers.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted helpers from bake.ts into bake-helpers.ts.</item>
  <item>RFC-0494: add uniqueFaqList and localEvidenceList helpers for city content fields.</item>
  <item>RFC-0496: add serviceVariantList, bookingRequirementList, pageStructureList helpers for service dossier fields.</item>
</CHANGE_SUMMARY>
*/

import type { BlueprintPillar, VirtualRouteEntry } from "@gogol/surface";
import type { BakeCtx } from "./bake.ts";

interface SectionLike {
  heading?: string;
  body?: string;
}
interface FaqLike {
  question?: string;
  answer?: string;
}
interface LocalFactLike {
  text?: string | Record<string, unknown>;
}
interface CitySpecificQaLike {
  question?: string;
  answer?: string;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// --- rotation + internal-linking helpers ----------------------------------------------------------

/** Deterministic FNV-1a hash → unsigned 32-bit. */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic constellation variant 0..n-1 from the page's axis tuple. */
export function variantFor(pageId: string, n: number): number {
  return hashString(pageId) % n;
}

/** Live children one depth deeper that extend this entry's tuple. */
export function childrenOf(
  entry: VirtualRouteEntry,
  entries: readonly VirtualRouteEntry[],
  axisOrder: readonly string[],
): VirtualRouteEntry[] {
  return entries.filter((other) => {
    if (other.depth !== entry.depth + 1 || !other.indexable) return false;
    return axisOrder.slice(0, entry.depth).every((axis) => other.axes[axis] === entry.axes[axis]);
  });
}

/** Live siblings at the same depth sharing the same parent tuple (excluding self). */
export function siblingsOf(
  entry: VirtualRouteEntry,
  entries: readonly VirtualRouteEntry[],
  axisOrder: readonly string[],
): VirtualRouteEntry[] {
  if (entry.depth === 0) return [];
  return entries.filter((other) => {
    if (other.depth !== entry.depth || !other.indexable || other.pageId === entry.pageId)
      return false;
    return axisOrder
      .slice(0, entry.depth - 1)
      .every((axis) => other.axes[axis] === entry.axes[axis]);
  });
}

/**
 * RFC-0238: skip intermediate singleton levels so users don't click through
 * single-country / single-region chains. Recursively collapses a child that has
 * exactly one live child until we reach a leaf or a branching node.
 */
export function skipSingletonChildren(
  entry: VirtualRouteEntry,
  entries: readonly VirtualRouteEntry[],
  axisOrder: readonly string[],
): VirtualRouteEntry[] {
  const result: VirtualRouteEntry[] = [];
  for (const child of childrenOf(entry, entries, axisOrder)) {
    const childChildren = childrenOf(child, entries, axisOrder);
    if (childChildren.length === 1) {
      const onlyChild = childChildren[0]!;
      const onlyChildChildren = childrenOf(onlyChild, entries, axisOrder);
      if (onlyChildChildren.length === 0) {
        result.push(child);
      } else {
        result.push(...skipSingletonChildren(onlyChild, entries, axisOrder));
      }
    } else {
      result.push(child);
    }
  }
  return result;
}

// --- labels ---------------------------------------------------------------------------------------

interface SurfaceLabels {
  cta: string;
  exit: string;
  related: string;
  more: string;
  closing: string;
  focus: string;
  scenarios: string;
  pitfalls: string;
  decision: string;
  trust: string;
  practical: string;
  localFacts: string;
  faq: string;
  localContext: string;
  fallbackTitle: string;
  questions: string;
  constraints: string;
  bookingContext: string;
  evidence: string;
  uniqueContent: string;
}
const SURFACE_LABELS: Record<string, SurfaceLabels> = {
  de: {
    cta: "Situation beschreiben",
    exit: "Notausgang ansehen",
    related: "Verwandte Seiten",
    more: "Weitere Seiten",
    closing: "Bereit für ein tragfähiges Fundament?",
    focus: "Worauf es ankommt",
    scenarios: "Typische Situationen",
    pitfalls: "Häufige Stolperstellen",
    decision: "Was vor Ort den Ausschlag gibt",
    trust: "Vertrauen, das vor Ort zählt",
    practical: "Praktische Hinweise",
    localFacts: "Geprüfte lokale Fakten",
    faq: "Häufige Fragen",
    localContext: "Lokaler Kontext",
    fallbackTitle: "Übersicht",
    questions: "Lokale Service-Fragen",
    constraints: "Lokale Rahmenbedingungen",
    bookingContext: "Lokaler Buchungskontext",
    evidence: "Lokale Evidenz",
    uniqueContent: "Einzigartige Inhalte",
  },
  uk: {
    cta: "Описати ситуацію",
    exit: "Переглянути аварійний вихід",
    related: "Пов'язані сторінки",
    more: "Інші сторінки",
    closing: "Готові до надійного цифрового фундаменту?",
    focus: "Що справді важливо",
    scenarios: "Типові ситуації",
    pitfalls: "Часті помилки",
    decision: "Що вирішує справу на місці",
    trust: "Довіра, що важлива локально",
    practical: "Практичні поради",
    localFacts: "Перевірені локальні факти",
    faq: "Поширені запитання",
    localContext: "Локальний контекст",
    fallbackTitle: "Огляд",
    questions: "Локальні сервісні запитання",
    constraints: "Локальні обмеження",
    bookingContext: "Локальний контекст бронювання",
    evidence: "Локальні докази",
    uniqueContent: "Унікальний контент",
  },
};
export function labelsFor(lang: string): SurfaceLabels {
  return SURFACE_LABELS[lang] ?? SURFACE_LABELS.de!;
}

// --- template + value helpers ---------------------------------------------------------------------

/**
 * Axis-value content for a language. The default-language entry is the base; the requested
 * language's entry is shallow-merged on top, so a localized file may translate only some fields and
 * the rest fall back to the default language (mirrors the authored-page deep-merge fallback).
 */
export function valData(
  ctx: BakeCtx,
  axisId: string,
  value: string | undefined,
  lang: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const def = ctx.axisDataByLang.get(ctx.defaultLang)?.get(axisId)?.get(value);
  const loc = ctx.axisDataByLang.get(lang)?.get(axisId)?.get(value);
  if (lang === ctx.defaultLang) return def ?? loc;
  if (!def && !loc) return undefined;
  return { ...(def ?? {}), ...(loc ?? {}) };
}

/** Resolve a `{axisId.field}` / `{axisId}` template against an entry's tuple + axis content. */
export function resolveTemplate(
  template: string,
  entry: VirtualRouteEntry,
  ctx: BakeCtx,
  lang: string,
): string {
  return template
    .replace(/\{([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\}/g, (_m, axisId: string, field?: string) => {
      const value = entry.axes[axisId];
      if (value === undefined) return "";
      if (!field || field === "slug") return value;
      const v = valData(ctx, axisId, value, lang)?.[field];
      return typeof v === "string" ? v : value;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The display title for an entry: the level titleTemplate (lang, else default), else axis names. */
export function titleForEntry(entry: VirtualRouteEntry, ctx: BakeCtx, lang: string): string {
  const level = ctx.levels.find((l) => l.depth === entry.depth);
  const tpl = level?.titleTemplate?.[lang] ?? level?.titleTemplate?.[ctx.defaultLang];
  if (tpl) return resolveTemplate(tpl, entry, ctx, lang);
  const names = ctx.axisOrder
    .slice(0, entry.depth)
    .map((a) => asString(valData(ctx, a, entry.axes[a], lang)?.name, entry.axes[a] ?? ""))
    .filter(Boolean);
  return names.join(" · ") || labelsFor(lang).fallbackTitle;
}

export function firstString(values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === "string" && v.trim()) return v;
  return undefined;
}
export function firstArray<T = unknown>(values: unknown[]): T[] | undefined {
  for (const v of values) if (Array.isArray(v) && v.length) return v as T[];
  return undefined;
}

/** The on-site URL for a target entry (default language unprefixed; others lang-prefixed; trailing slash). */
export function hrefFor(target: VirtualRouteEntry, lang: string, defaultLang: string): string {
  const slug =
    target.routes[lang] ?? target.routes[defaultLang] ?? Object.values(target.routes)[0] ?? "";
  const prefix = lang === defaultLang ? "" : `${lang}/`;
  return `/${prefix}${slug}/`.replace(/\/+/g, "/");
}

/** A short teaser description for a target entry, from its deepest axis-value content. */
export function teaserDesc(
  target: VirtualRouteEntry,
  ctx: BakeCtx,
  lang: string,
): string | undefined {
  const values = ctx.axisOrder
    .slice(0, target.depth)
    .map((a) => valData(ctx, a, target.axes[a], lang))
    .reverse()
    .filter((d): d is Record<string, unknown> => Boolean(d));
  const text =
    firstString(values.map((d) => d.metaDescription)) ?? firstString(values.map((d) => d.intro));
  if (!text) return undefined;
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
}

/** RFC-0207: the first {image, imageAlt} token across axis values (deepest axis wins). */
export function pickImage(
  values: Array<Record<string, unknown>>,
): { src: string; alt: string } | undefined {
  for (const d of values) {
    if (typeof d.image === "string" && d.image.trim()) {
      return { src: d.image.trim(), alt: typeof d.imageAlt === "string" ? d.imageAlt : "" };
    }
  }
  return undefined;
}

/** RFC-0207: the image token for a teaser target entry (deepest axis with an image wins).
 *  Demand-level entries only use their own axis image; no fallback to parent axes so that
 *  missing demand images render as text-only placeholders instead of generic industry photos. */
export function teaserImage(
  target: VirtualRouteEntry,
  ctx: BakeCtx,
  lang: string,
): { image: string; imageAlt: string } | undefined {
  const demandValue = target.axes["demand"];
  if (demandValue !== undefined) {
    const demandData = valData(ctx, "demand", demandValue, lang);
    if (demandData?.image && typeof demandData.image === "string") {
      return {
        image: demandData.image.trim(),
        imageAlt: typeof demandData.imageAlt === "string" ? demandData.imageAlt : "",
      };
    }
    return undefined;
  }

  const values = ctx.axisOrder
    .slice(0, target.depth)
    .map((a) => valData(ctx, a, target.axes[a], lang))
    .reverse()
    .filter((d): d is Record<string, unknown> => Boolean(d));
  const picked = pickImage(values);
  return picked ? { image: picked.src, imageAlt: picked.alt } : undefined;
}

/** A {heading, body}[] array field (e.g. `sections`), filtered to complete entries. */
export function objectList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ heading: string; body: string }> {
  return (firstArray<SectionLike>(values.map((d) => d[field])) ?? []).filter(
    (s): s is { heading: string; body: string } => Boolean(s?.heading && s?.body),
  );
}

/** A {title, description}[] array field (specialFocus/scenarioSnippets), filtered to complete entries. */
export function titledList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ title?: unknown; description?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "",
      description: typeof r.description === "string" ? r.description : "",
    }))
    .filter((r) => r.title && r.description);
}

/** A plain string[] field, filtered to non-empty trimmed strings. */
export function stringList(values: Array<Record<string, unknown>>, field: string): string[] {
  const raw = firstArray<unknown>(values.map((d) => d[field])) ?? [];
  return raw.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
}

/** A source-backed local fact array, rendered as visible page evidence when present. */
export function localFactList(values: Array<Record<string, unknown>>, lang: string): string[] {
  const raw = firstArray<LocalFactLike>(values.map((d) => d.localFacts)) ?? [];
  return raw
    .map((fact) => {
      if (typeof fact.text === "string") return fact.text.trim();
      if (fact.text && typeof fact.text === "object") {
        const localized = fact.text as Record<string, unknown>;
        const text = localized[lang] ?? localized.de ?? Object.values(localized)[0];
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

/** A city-specific Q&A array, kept separate from generic FAQ so local pages gain real substance. */
export function citySpecificQaList(
  values: Array<Record<string, unknown>>,
): Array<{ question: string; answer: string }> {
  const raw = firstArray<CitySpecificQaLike>(values.map((d) => d.citySpecificQa)) ?? [];
  return raw
    .map((item) => ({
      question: typeof item.question === "string" ? item.question.trim() : "",
      answer: typeof item.answer === "string" ? item.answer.trim() : "",
    }))
    .filter((item) => item.question && item.answer);
}

/**
 * RFC-0490: read the pillar block for a depth-0 level, with language fallback.
 * Returns undefined when the level has no pillar configuration.
 */
export function pillarFor(ctx: BakeCtx, depth: number, lang: string): BlueprintPillar | undefined {
  const level = ctx.levels.find((l) => l.depth === depth);
  return level?.pillar;
}

/**
 * RFC-0490: resolve a localized string from a pillar field, falling back to the default language.
 */
export function pillarLang(
  field: Record<string, string> | undefined,
  lang: string,
  defaultLang: string,
): string {
  return field?.[lang] ?? field?.[defaultLang] ?? "";
}

// --- RFC-0492: dossier field helpers --------------------------------------------------------------

/** RFC-0492: a {category, description}[] field (serviceTaxonomy), filtered to complete entries. */
export function taxonomyList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ category?: unknown; description?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.category === "string" ? r.category : "",
      description: typeof r.description === "string" ? r.description : "",
    }))
    .filter((r) => r.title && r.description);
}

/** RFC-0492: a {title, stages[]}[] field (customerJourneys), filtered to complete entries. */
export function journeyList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ title?: unknown; stages?: unknown[] }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "",
      description: Array.isArray(r.stages)
        ? r.stages.filter((s): s is string => typeof s === "string").join(" → ")
        : "",
    }))
    .filter((r) => r.title && r.description);
}

/** RFC-0492: a {page, description}[] field (recommendedArchitecture), filtered to complete entries. */
export function architectureList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ page?: unknown; description?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.page === "string" ? r.page : "",
      description: typeof r.description === "string" ? r.description : "",
    }))
    .filter((r) => r.title && r.description);
}

/** RFC-0492: a {module, applicability}[] field (suitableModules), filtered to complete entries. */
export function moduleList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ module?: unknown; applicability?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.module === "string" ? r.module : "",
      description: typeof r.applicability === "string" ? r.applicability : "",
    }))
    .filter((r) => r.title && r.description);
}

/** RFC-0494: a city-specific Q&A array from the city content collection (uniqueFaq), filtered to complete entries. */
export function uniqueFaqList(
  values: Array<Record<string, unknown>>,
): Array<{ question: string; answer: string }> {
  const raw = firstArray<FaqLike>(values.map((d) => d.uniqueFaq)) ?? [];
  return raw
    .map((item) => ({
      question: typeof item.question === "string" ? item.question.trim() : "",
      answer: typeof item.answer === "string" ? item.answer.trim() : "",
    }))
    .filter((item) => item.question && item.answer);
}

/** RFC-0494: a local-evidence string array from the city content collection (localEvidence), filtered to non-empty trimmed strings. */
export function localEvidenceList(values: Array<Record<string, unknown>>): string[] {
  const raw = firstArray<unknown>(values.map((d) => d.localEvidence)) ?? [];
  return raw.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
}

// --- RFC-0496: service dossier field helpers ------------------------------------------------------

/** RFC-0496: a {displayName, description}[] field (serviceVariants), filtered to complete entries. */
export function serviceVariantList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ displayName?: unknown; description?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.displayName === "string" ? r.displayName : "",
      description: typeof r.description === "string" ? r.description : "",
    }))
    .filter((r) => r.title && r.description);
}

/** RFC-0496: a {mode, description}[] field (bookingRequirements), filtered to complete entries. */
export function bookingRequirementList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ mode?: unknown; description?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.mode === "string" ? r.mode : "",
      description: typeof r.description === "string" ? r.description : "",
    }))
    .filter((r) => r.title && r.description);
}

/** RFC-0496: a {page, description}[] field (recommendedPageStructure), filtered to complete entries. */
export function pageStructureList(
  values: Array<Record<string, unknown>>,
  field: string,
): Array<{ title: string; description: string }> {
  const raw =
    firstArray<{ page?: unknown; description?: unknown }>(values.map((d) => d[field])) ?? [];
  return raw
    .map((r) => ({
      title: typeof r.page === "string" ? r.page : "",
      description: typeof r.description === "string" ? r.description : "",
    }))
    .filter((r) => r.title && r.description);
}

export type { FaqLike };
