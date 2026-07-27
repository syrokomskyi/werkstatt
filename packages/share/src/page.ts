/*
<MODULE_CONTRACT>
<purpose>
Build resolved page models from entry data, executing the block composition
pipeline for each block defined in a page's content.
</purpose>
<non-goals>
  <item>Do not own content loading or route file dispatch.</item>
  <item>Do not handle growth, passport, or other cross-cutting concerns
    (those are wired in the route or layout).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation — ResolvedPage/ResolvedBlock types and buildPage pipeline.</item>
  <item>Moved SectionProps into shared package for cross-app consumption.</item>
  <item>RFC-0091: PLANET_IMPORT_PATHS and BLOCK_TYPE_TO_COSMIC_NAME now derived from registry; import from @warpgogol/ontology/archetypes instead of literal constants.</item>
  <item>RFC-0262: add the optional BuildPageOptions.validateProps dev-time fail-fast hook, called once per resolved shell and content block.</item>
  <item>RFC-0263: hideSectionNumber injection now keyed off registry-derived roleByCosmicName[planetName] === "hero" instead of the hardcoded UNNUMBERED_HERO_PLANETS literal set (deleted).</item>
  <item>RFC-0264: relocated SectionProps/SectionPageOverride here from the @warpgogol/share root barrel (its natural domain owner); consumers now import from @warpgogol/share/page.</item>
</CHANGE_SUMMARY>
*/

import type { RuntimeContext } from "./runtime-context.ts";
import { evalVisibility, type ResolvedFeatureGraph, EMPTY_FEATURE_GRAPH } from "./visibility.ts";
import {
  planetImportPaths as registryPlanetImportPaths,
  blockTypeToCosmicName as registryBlockTypeToCosmicName,
  moonImportPaths as registryMoonImportPaths,
  roleByCosmicName as registryRoleByCosmicName,
} from "@warpgogol/ontology/archetypes";

// @ai-invariant: PageEntry and BlockEntry shapes MUST stay structurally
// compatible with @warpgogol/ontology/schemas PageEntrySchema / BlockEntrySchema.
// Any field change here requires a matching change there and in every
// system.md pages[] block that references the changed field.

export interface PageEntry {
  kind: "page";
  cosmicStar: string;
  title: string;
  description: string;
  lang: string;
  blocks: BlockEntry[];
}

export interface BlockEntry {
  id?: string;
  type?: string; // CMS-facing archetype slug — validated by page.block.validate
  use?: string; // PlanetName or MoonName — normalized from type for internal resolution
  props: Record<string, any>;
  visibility?: import("./visibility.ts").VisibilityExpr;
  /** Block layer — shell blocks render before content blocks (RFC-0036). */
  layer?: "shell" | "section";
}

// ---------------------------------------------------------------------------
// Shell block types (RFC-0036)
// ---------------------------------------------------------------------------

export interface ShellBlockConfig {
  enabled?: boolean;
  cosmicMoon: string; // MoonName from MoonCatalog
  pin: string;
  props?: Record<string, any>;
}

export interface ShellConfig {
  background?: ShellBlockConfig;
  header?: ShellBlockConfig;
  footer?: ShellBlockConfig;
}

/**
 * A single block after visibility evaluation and prop validation.
 * All blocks in ResolvedPage.blocks passed visibility — invisible blocks are dropped.
 */
export interface ResolvedBlock {
  /** Stable kebab-case block id from the content entry (null if not declared). */
  readonly id: string | null;
  /** The PlanetName or MoonName identifying this block's archetype. */
  readonly planetName: string;
  /**
   * Stable import path into packages/ui for the component.
   * Used by the page route to dynamically load the component:
   *   const sections = import.meta.glob("@warpgogol/ui/sections/*")
   *   const Component = sections[block.componentImportPath]
   */
  readonly componentImportPath: string;
  /** Props already evaluated and ready to spread into the component. */
  readonly props: Record<string, any>;
  /** The raw visibility expression (retained for attribution / debugging). null if absent. */
  readonly visibility: import("./visibility.ts").VisibilityExpr | null;
  /** Block layer — shell blocks are prepended and render before content blocks (RFC-0036). */
  readonly layer?: "shell" | "section";
}

/**
 * A fully resolved page: title/description from the entry, filtered block list,
 * and the RuntimeContext used during resolution.
 */
export interface ResolvedPage {
  /** The IAU star name identifying this page in the cosmic overlay. */
  readonly star: string;
  readonly title: string;
  readonly description: string;
  readonly lang: string;
  /** Blocks that passed visibility evaluation, in document order. */
  readonly blocks: readonly ResolvedBlock[];
  /** The RuntimeContext used during resolution — retained for attribution. */
  readonly ctx: RuntimeContext;
}

// RFC-0035: Universal Section Props Contract — every resolved content block's
// props extend this shape. RFC-0264: relocated from the @warpgogol/share root
// barrel to page.ts (its natural domain owner); re-exported from the `./page`
// subpath.
export interface SectionProps {
  /** Active locale for i18n rendering */
  lang: string;
  /** App default locale for RFC-0008 site/content fallback */
  defaultLanguageCode: string;
  /** Zero-padded section index (01, 02, ...) for anchors and styling */
  sectionNumber: string;
  /** Optional link registry for CTA/link resolution */
  linkRegistry?: Record<string, string | null>;
  /** Complete block.props as declared in page frontmatter */
  pageOverride: Record<string, any>;
  /** RFC-0048: Stable pageId for localized anchor resolution */
  pageId?: string;
}

/** Type helper for sections to declare their specific pageOverride shape */
export type SectionPageOverride<T extends Record<string, any>> = SectionProps & {
  pageOverride: T;
};

// @ai-invariant: PLANET_IMPORT_PATHS and MOON_IMPORT_PATHS are the single
// source of truth for cosmicName → import path resolution. Every name added
// to a manifest MUST also appear in one of these maps (via the archetype
// registry), and vice versa. Silent mismatches cause
// "[buildPage] No component import path registered for ..." at runtime.
// Three-way alignment: manifest.yaml cosmicName ↔ import-paths map ↔ system.md pin.

// Default PlanetName → import path table
// Derived from the archetype registry via @warpgogol/ontology/archetypes
// (RFC-0091). The archetype.registry.build command regenerates
// packages/ontology/archetypes/index.yaml from manifests.
// ---------------------------------------------------------------------------

/**
 * RFC-0091 fallback: entries that cannot be derived from manifests but must
 * remain registered. Empty since RFC-0175 — Amalthea (formerly a reserved
 * placeholder mapped to hero) is now claimed by the chat-widget section, so the
 * registry-derived mapping is authoritative. The registry is spread LAST so a
 * real manifest mapping always wins over any future placeholder fallback.
 */
const PLANET_IMPORT_PATHS_FALLBACK: Record<string, string> = {};

/** @internal */
export const PLANET_IMPORT_PATHS: Record<string, string> = {
  ...PLANET_IMPORT_PATHS_FALLBACK,
  ...registryPlanetImportPaths,
};

// ---------------------------------------------------------------------------
// MoonCatalog → import path table (RFC-0036)
// Components that can be used as shell-level blocks.
// RFC-0097: derived from the archetype registry just like PLANET_IMPORT_PATHS.
// `packages/ontology/archetypes/index.yaml` is regenerated by
// `archetype.registry.build` from every shell.* manifest under
// `packages/ui/src/components/shell/`. The previous
// MOON_IMPORT_PATHS_FALLBACK (Hermippe → site-background) was retired by
// RFC-0108 Proposal D once the registry began discovering the shell archetype
// directly; the registry is now the single source of truth.
// ---------------------------------------------------------------------------

/** @internal */
export const MOON_IMPORT_PATHS: Record<string, string> = {
  ...registryMoonImportPaths,
};

/** @internal */
export const BLOCK_TYPE_TO_COSMIC_NAME: Record<string, string> = registryBlockTypeToCosmicName;

export function normalizeBlockType(block: BlockEntry): string {
  const selector = block.type ?? block.use;
  if (!selector) {
    throw new Error("[buildPage] Block is missing required author-facing `type`.");
  }
  return BLOCK_TYPE_TO_COSMIC_NAME[selector] ?? selector;
}

/**
 * Resolves a PlanetName to the stable import path of its section component.
 * Returns null if no mapping is registered.
 */
export function resolveComponentPath(planetName: string): string | null {
  return PLANET_IMPORT_PATHS[planetName] ?? null;
}

// ---------------------------------------------------------------------------
// BuildPageOptions
// ---------------------------------------------------------------------------

export interface BuildPageOptions {
  /**
   * Override the default PlanetName → import path resolver.
   * Useful when the caller can resolve paths from the live uni.registry.yaml.
   */
  resolveImportPath?: (planetName: string) => string | null;
  /**
   * Provide a resolved feature graph for visibility evaluation.
   * Defaults to EMPTY_FEATURE_GRAPH (all features enabled) when omitted.
   */
  featureGraph?: ResolvedFeatureGraph;
  /**
   * Shell-level blocks from system.yaml prepended to content blocks (RFC-0036).
   * These bypass visibility evaluation and are always included if enabled.
   */
  shellBlocks?: ShellBlockConfig[];
  /**
   * RFC-0262: dev-only fail-fast prop validation. When supplied, buildPage
   * calls this once per resolved block (shell and content) with the block's
   * PlanetName/MoonName, its evaluated props, and its stable block id (null
   * for shell blocks). A violation should throw — buildPage does not catch
   * it, matching its existing "never silently drop a block" contract.
   * page.block.validate (build.check) remains the deploy-time gate; this
   * hook exists purely so an agent iterating in `astro dev` sees the same
   * violation immediately instead of only at the next build:check run.
   */
  validateProps?: (
    planetName: string,
    props: Record<string, unknown>,
    blockId: string | null,
  ) => void | Promise<void>;
}

// @ai-invariant: buildPage is the SINGLE page pipeline (DNA-25). Every page
// route MUST call it once per locale; no route may hand-assemble block
// composition. Routes that bypass buildPage fail page.pipeline.contract.
// buildPage throws on missing import paths — it never silently drops blocks.

/**
 * The single build-time page pipeline (DNA-25, RFC-0026).
 *
 * Call this once per page route, once per locale:
 * ```ts
 * const ctx = EMPTY_RUNTIME_CONTEXT(lang);
 * const page = await buildPage(entry.data, ctx);
 * ```
 *
 * buildPage guarantees:
 *   - All blocks with `visibility` evaluating false are dropped from ResolvedPage.blocks.
 *   - All remaining blocks have a non-null componentImportPath.
 *   - No block is skipped silently due to an error — errors throw.
 *
 * Cross-reference checks (star/route coherence, system.yaml pin list,
 * propsSchema strict validation) run in page.block.validate (build.check),
 * not inside buildPage. buildPage is intentionally lenient at render time
 * so that validators provide precise error messages.
 *
 * @throws {Error} if a block's `use` has no registered component import path.
 */
/**
 * Combined resolver that checks both PlanetCatalog and MoonCatalog (RFC-0036).
 * MoonCatalog is checked first for shell-level components.
 */
export function resolveComponentPathUnified(name: string): string | null {
  return MOON_IMPORT_PATHS[name] ?? PLANET_IMPORT_PATHS[name] ?? null;
}

export async function buildPage(
  entry: PageEntry,
  ctx: RuntimeContext,
  options?: BuildPageOptions,
): Promise<ResolvedPage> {
  const resolver = options?.resolveImportPath ?? resolveComponentPathUnified;
  const featureGraph: ResolvedFeatureGraph = options?.featureGraph ?? EMPTY_FEATURE_GRAPH;
  const shellBlocks = options?.shellBlocks ?? [];

  const resolvedBlocks: ResolvedBlock[] = [];

  // Process shell blocks first (RFC-0036) — these bypass visibility
  for (const shellBlock of shellBlocks) {
    if (shellBlock.enabled === false) continue;

    const componentImportPath = resolver(shellBlock.cosmicMoon);
    if (componentImportPath === null) {
      throw new Error(
        `[buildPage] No component import path registered for moon "${shellBlock.cosmicMoon}". ` +
          `Register it in MOON_IMPORT_PATHS or supply a custom resolveImportPath option.`,
      );
    }

    const shellProps = shellBlock.props ?? {};
    if (options?.validateProps)
      await options.validateProps(shellBlock.cosmicMoon, shellProps, null);

    resolvedBlocks.push({
      id: null,
      planetName: shellBlock.cosmicMoon,
      componentImportPath,
      props: shellProps,
      visibility: null,
      layer: "shell",
    });
  }

  // Process content blocks with visibility evaluation
  for (const block of entry.blocks) {
    // Evaluate visibility — drop blocks that evaluate false
    const visible = evalVisibility(block.visibility ?? null, ctx, featureGraph);
    if (!visible) continue;

    // Resolve the component import path
    const planetName = normalizeBlockType(block);
    const componentImportPath = resolver(planetName);
    if (componentImportPath === null) {
      throw new Error(
        `[buildPage] No component import path registered for block "${planetName}". ` +
          `Register it in PLANET_IMPORT_PATHS or supply a custom resolveImportPath option.`,
      );
    }

    const contentProps =
      registryRoleByCosmicName[planetName] === "hero"
        ? { ...block.props, hideSectionNumber: true }
        : block.props;
    if (options?.validateProps) {
      await options.validateProps(planetName, contentProps, block.id ?? null);
    }

    resolvedBlocks.push({
      id: block.id ?? null,
      planetName,
      componentImportPath,
      props: contentProps,
      visibility: block.visibility ?? null,
      layer: block.layer ?? "section",
    });
  }

  return {
    star: entry.cosmicStar,
    title: entry.title,
    description: entry.description,
    lang: entry.lang,
    blocks: resolvedBlocks,
    ctx,
  };
}
