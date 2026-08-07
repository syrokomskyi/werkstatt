/*
<MODULE_CONTRACT>
<purpose>
Semantic-layer helpers for resolvePageRoute: layout-orchestrator flag derivation (RFC-0106),
{collection.file.field} prop substitution (RFC-0138), and the RFC-0229 breadcrumb ancestor
resolvers (Programmatic Surface + authored parentPageId chain) plus visible breadcrumbs
section injection.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of astro/page-handler.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import {
  BLOCK_TYPE_TO_COSMIC_NAME,
  resolveComponentPathUnified,
  type ResolvedBlock,
  type ResolvedPage,
} from "../../page.ts";
import {
  buildBreadcrumbTrail,
  surfaceAncestorPageIds,
  type BreadcrumbAncestorResolver,
  type BreadcrumbCrumb,
} from "../../semantic/breadcrumbs.ts";
import type { SemanticBreadcrumb } from "../../semantic/models.ts";
import { getAlternateLinks, localizeUrl, type RouteRegistry } from "../routes.ts";
import { getSurfaceEntries, getSurfaceEntryByPageId } from "../surface-routes.ts";
import {
  getContentRefIndex,
  resolveReferencesDeep,
  EMPTY_CONTENT_REF_INDEX,
} from "../../content-reference.ts";

// re-exported so downstream modules can build alternate links from this same barrel if needed.
export { buildBreadcrumbTrail, getAlternateLinks };

const BREADCRUMBS_BLOCK_TYPE = "breadcrumbs";
const BREADCRUMBS_COSMIC_NAME = BLOCK_TYPE_TO_COSMIC_NAME[BREADCRUMBS_BLOCK_TYPE] ?? "Thebe"; // cosmic-literals-ignore: defensive fallback if the registry lookup ever misses; registry wins when present.

/**
 * Per-page S-2 layout-orchestrator opt-in flags (RFC-0106).
 *
 * Derived from the page's resolved blocks at build time and injected into
 * `window.__SITE_CONFIG.orchestrator` by `<Layout>`. Runtime
 * `runStandardLayoutOrchestration` reads these flags to know which GSAP
 * primitive bundles to import. Without this object the orchestrator silently
 * defaults all flags to `false` and animations never run.
 */
export interface OrchestratorConfig {
  counters: boolean;
  inlineNumbers: boolean;
  reveal: boolean;
  parallax: boolean;
  stagger: boolean;
  /** RFC-0205: opt-in Lenis smooth scroll. Default false — avoids loading the 17 KB bundle on pages that do not need it. */
  smoothScroll: boolean;
}

/**
 * Walk the page's resolved blocks and derive the orchestrator flags following
 * the LAY-01 rule table in RFC-0106 / RFC-0108 §"layout.orchestrator.lint":
 *  - counters       ← any body.kind:"stats" block with animated:true
 *  - inlineNumbers  ← any body.kind:"rich" block with animateNumbers:true
 *  - reveal         ← any block declaring motion.reveal
 *  - parallax       ← any block declaring motion.parallax, or any shell
 *                     site-background image layer with parallax:true
 *  - stagger        ← any block declaring motion.stagger
 */
export function deriveOrchestratorConfig(
  blocks: ReadonlyArray<{
    props?: Record<string, unknown>;
    layer?: "shell" | "section";
    planetName?: string;
  }>,
): OrchestratorConfig {
  const flags: OrchestratorConfig = {
    counters: false,
    inlineNumbers: false,
    reveal: false,
    parallax: false,
    stagger: false,
    smoothScroll: false,
  };
  for (const block of blocks) {
    const props = (block.props ?? {}) as Record<string, unknown>;
    const motion = props.motion as Record<string, unknown> | undefined;
    if (motion && motion.off !== true) {
      if (motion.reveal !== undefined) flags.reveal = true;
      if (motion.parallax !== undefined) flags.parallax = true;
      if (motion.stagger !== undefined) flags.stagger = true;
    }
    const body = props.body as Record<string, unknown> | undefined;
    if (body?.kind === "stats" && body.animated === true) flags.counters = true;
    if (Array.isArray(props.stats) && props.animated === true) flags.counters = true;
    if (body?.kind === "rich" && body.animateNumbers === true) flags.inlineNumbers = true;
    // Shell-layer site-background image layer with parallax.
    if (block.layer === "shell") {
      const layers = props.layers as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(layers)) {
        for (const layer of layers) {
          if (layer.kind === "image" && layer.parallax) flags.parallax = true;
        }
      }
    }
  }
  return flags;
}

/**
 * RFC-0138/RFC-0529: Resolve braceless collection.file.field references in block props at render time.
 *
 * The block dispatch path passes block `props` to section components as `pageOverride`.
 * Without this step a reference written in a prop (e.g. `monthly: business.offer.price.monthly`)
 * would render literally. We use the RFC-0527 index-based resolver
 * (`resolveReferencesDeep`, build-time/SSR only) to substitute every string leaf;
 * non-string values pass through unchanged. Substitution runs once in this shared handler so
 * every app and section benefits without per-section code.
 *
 * The synthesized `pages/<lang>/...` path lets the resolver infer the page language for
 * localized lookups (with the resolver's built-in default-language fallback).
 */
export async function substituteBlockPropReferences(
  blocks: ResolvedPage["blocks"],
  lang: string,
  fileSlug: string,
  defaultLang: string,
): Promise<ResolvedPage["blocks"]> {
  const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
  return Promise.all(
    blocks.map(async (block) => ({
      ...block,
      props: (await resolveReferencesDeep(index, block.props, lang, defaultLang, {
        collection: "pages",
        file: fileSlug,
      })) as Record<string, any>,
    })),
  );
}

/**
 * RFC-0229 / RFC-0238: ordered breadcrumb ancestors for a Programmatic Surface page, derived from
 * its synthetic pageId. For each level above the page the matching surface entry is looked up;
 * non-live (missing / noindex / redirect) ancestors are skipped so the trail stays clickable.
 * Additionally, singleton intermediate levels (country/region with exactly 1 live child) are
 * collapsed so the user sees industry → city directly. Root-first.
 */
export async function resolveSurfaceAncestors(
  selfPageId: string,
  lang: string,
  defaultLang: string,
): Promise<BreadcrumbCrumb[]> {
  const allEntries = await getSurfaceEntries();
  const crumbs: BreadcrumbCrumb[] = [];
  for (const ancestorId of surfaceAncestorPageIds(selfPageId)) {
    const entry = await getSurfaceEntryByPageId(ancestorId);
    if (!entry || !entry.indexable || entry.noindex) continue;

    // RFC-0238: skip singleton intermediate geo levels (country, region) in breadcrumbs.
    // An ancestor is skipped when it is the ONLY live sibling at its depth — i.e. its parent
    // has exactly one live child on that level. Applied only to depth >= 2 (geo axes), so
    // the landing page (depth 0) and industry page (depth 1) are never suppressed.
    const lastColon = ancestorId.lastIndexOf(":");
    const parentPrefix = lastColon > 0 ? ancestorId.slice(0, lastColon) : ancestorId;
    const siblingSegments = ancestorId.split(":").length;
    const liveSiblings = allEntries.filter(
      (e) =>
        e.depth === entry.depth &&
        e.indexable &&
        e.pageId.startsWith(parentPrefix + ":") &&
        e.pageId.split(":").length === siblingSegments,
    );
    if (liveSiblings.length === 1 && entry.depth >= 2) continue;

    const slug = entry.routes[lang] ?? entry.routes[defaultLang];
    if (slug === undefined) continue;
    const name = entry.pages?.[lang]?.title ?? entry.page?.title ?? "";
    if (!name) continue;
    crumbs.push({
      // RFC-0229: a root-relative path, never an absolute URL — visible breadcrumb links must work
      // in every environment (local, preview, prod). The JSON-LD layer absolutizes against the
      // page's canonical origin.
      name,
      url: localizeUrl(lang, slug, { defaultLanguage: defaultLang }),
      pageId: ancestorId,
    });
  }
  return crumbs;
}

/**
 * RFC-0229: ordered breadcrumb ancestors for an authored page, walking the `parentPageId` chain in
 * the route registry (Home → …parents… → self). Each parent's grammatical crumb name is its own
 * page title (loaded from content); a parent with no localized route is skipped. Cycle-safe; the
 * chain is reversed to root-first to match the surface resolver's contract.
 */
export async function resolveAuthoredAncestors(
  parentPageId: string | undefined,
  lang: string,
  defaultLang: string,
  registry: RouteRegistry,
  loadLocalizedPageEntry: (
    pageId: string,
    lang: string,
    defaultLang: string,
  ) => Promise<{ title?: unknown } | null>,
): Promise<BreadcrumbCrumb[]> {
  const chain: BreadcrumbCrumb[] = [];
  const seen = new Set<string>();
  let current = parentPageId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const entry = registry.byPageId.get(current);
    if (!entry) break;
    const slug = entry.routes[lang] ?? entry.routes[defaultLang];
    if (slug !== undefined) {
      const parentEntry = await loadLocalizedPageEntry(current, lang, defaultLang);
      const name = typeof parentEntry?.title === "string" ? parentEntry.title : current;
      chain.push({
        // RFC-0229: root-relative path (see resolveSurfaceAncestors); absolutized only in JSON-LD.
        name,
        url: localizeUrl(lang, slug, { defaultLanguage: defaultLang }),
        pageId: current,
      });
    }
    current = entry.parentPageId;
  }
  return chain.reverse();
}

/**
 * RFC-0229: inject the canonical breadcrumb trail as a visible breadcrumbs section. Runs for every
 * non-home page (authored + Programmatic Surface) unless the page already places its own breadcrumbs
 * block. The injected items are identical to the trail fed into the JSON-LD BreadcrumbList, so the
 * visible navigation and the structured data never diverge.
 */
export function injectBreadcrumbsBlock(
  blocks: ResolvedPage["blocks"],
  trail: SemanticBreadcrumb[],
): ResolvedPage["blocks"] {
  if (trail.length <= 1) return blocks;
  if (blocks.some((block) => block.planetName === BREADCRUMBS_COSMIC_NAME)) return blocks;

  const breadcrumbImportPath = resolveComponentPathUnified(BREADCRUMBS_COSMIC_NAME);
  if (!breadcrumbImportPath) return blocks;

  let insertIndex = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index]?.layer === "shell") insertIndex = index + 1;
  }

  const breadcrumbBlock: ResolvedBlock = {
    id: null,
    planetName: BREADCRUMBS_COSMIC_NAME,
    componentImportPath: breadcrumbImportPath,
    props: { items: trail.map((crumb) => ({ name: crumb.name, url: crumb.url })) },
    visibility: null,
    layer: "section",
  };

  return [...blocks.slice(0, insertIndex), breadcrumbBlock, ...blocks.slice(insertIndex)];
}

export type { BreadcrumbAncestorResolver };
