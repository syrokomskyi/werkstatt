/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0192] Closed contracts for the Programmatic Surface route-source port: the axis/record
  model, the eligibility policy, the materialized virtual route entry, and the PageSurfaceProvider
  interface. Framework-free — no Astro, no Node I/O. These types are the seam shared by the
  build-time generator (kernel command) and the runtime registry merge.
</purpose>
<non-goals>
  <item>Do not read content or the filesystem — all I/O lives in the kernel command wrapper.</item>
  <item>Do not define the Blueprint schema (see blueprint.ts) or substance/budget/freshness (later RFCs).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: initial contracts.</item>
  <item>RFC-0207: SurfaceNarrative (bespoke per-page hero/section prose) + SurfaceRecordImage (per-record image token + alt).</item>
</CHANGE_SUMMARY>
*/

/**
 * RFC-0207: the bespoke per-page narrative that replaces template-glued headings for an indexable
 * page. Produced once per live tuple (or per record) by surface.enrich, stored frozen + approved as
 * a content entry, and read by the baker. The h1/lead/tagline land in the hero; bridges become
 * connective section prose between the field-driven blocks. Transcreated natively per language.
 */
export interface SurfaceNarrative {
  /** Grammatically complete page H1 (not a token-glued title). */
  h1: string;
  /** Hero lead — distinct from any record field and from the tagline. */
  lead: string;
  /** Hero tagline — distinct from the lead. */
  tagline?: string;
  /** Connective section prose woven between the field-driven blocks. */
  bridges?: Array<{ heading: string; body: string }>;
}

/**
 * RFC-0207: a surface dataset record's image. `image` is a content-asset token resolved exactly like
 * a hero `leadImage.src` / `portraitImage` (bare filename under the app's content assets, RFC-0167);
 * `imageAlt` is the meaningful alt text (per-language record carries the per-language alt). Mixed into
 * SurfaceRecord so the baker can read it without a separate load.
 */
export interface SurfaceRecordImage {
  image?: string;
  imageAlt?: string;
}

/**
 * RFC-0192: a block in a baked page. Structurally compatible with `@warpgogol/share` `BlockEntry`, but
 * declared here so `@warpgogol/surface` stays the lower-level package with no dependency on share
 * (avoids a workspace cycle — share consumes surface's route types).
 */
export interface SurfaceBlock {
  id?: string;
  /** CMS-facing archetype slug (e.g. "hero", "markdown", "final-cta"). */
  type?: string;
  /** PlanetName/MoonName (normalized from `type` for internal resolution). */
  use?: string;
  props: Record<string, unknown>;
  layer?: "shell" | "section";
}

/** RFC-0192: a baked block-declarative page. Structurally compatible with `@warpgogol/share` `PageEntry`. */
export interface PageEntry {
  kind: "page";
  cosmicStar: string;
  title: string;
  description: string;
  lang: string;
  blocks: SurfaceBlock[];
}

/** A single combinatorial axis and the closed universe of value slugs it ranges over. */
export interface SurfaceAxis {
  id: string;
  /** Value slugs, sourced from a content-source collection by the generator. */
  universe: readonly string[];
}

/** A partial assignment of axis ids → chosen value (undefined ⇒ axis not yet constrained). */
export type AxisTuple = Record<string, string | undefined>;

/**
 * RFC-0199: a value's slug, optionally localized per language. The `neutral` slug is the
 * language-neutral identity key (filename stem / `slug` field) and the fallback; `byLang`
 * supplies a per-language URL segment. Languages absent from `byLang` fall back to `neutral`.
 */
export interface LocalizedSlug {
  neutral: string;
  byLang?: Record<string, string>;
}

/**
 * RFC-0199: per-axis localized slug map — axisId → (neutral value slug → its LocalizedSlug).
 * An empty/absent universe makes slug rendering fall back to the neutral tuple value, so the
 * generator output is byte-identical to pre-RFC-0199 behavior when no localized slugs exist.
 */
export type LocalizedUniverse = Record<string, Map<string, LocalizedSlug>>;

/**
 * A dataset row projected into axis-addressable fields. Each axis declares which record field
 * carries its membership (a value or an array of values). `status` gates live vs archived rows.
 */
export type SurfaceRecord = Record<string, string | string[] | undefined> & {
  slug?: string;
  status?: "active" | "archived";
};

export type RedirectPolicy = "nearest-ancestor" | "root";

/**
 * The eligibility policy: how many records a combination needs to go live at each depth, when a
 * live page is demoted to noindex, what empty combinations redirect to, and URL-segment rules.
 * Axis-generic generalization of the legacy foerderung policy.
 */
export interface EligibilityPolicy {
  /** depth → minimum active records required to emit a live page. */
  minRecordsPerDepth: Readonly<Record<number, number>>;
  /** depth → live-but-`noindex` threshold (live page tagged noindex below this count). */
  noindexBelowPerDepth: Readonly<Record<number, number>>;
  redirectPolicy: RedirectPolicy;
  trailingSlash: boolean;
  /** Allowed URL-segment shape (single lowercase dash segment by default). */
  segmentPattern: RegExp;
}

/**
 * The reason a generated page is not indexable. Extended by later RFCs (substance/budget/freshness);
 * RFC-0192 emits only the record-count reasons.
 */
export type IndexReason =
  | "too-few-records"
  | "thin" // RFC-0194
  | "over-budget" // RFC-0196
  | "decayed" // RFC-0196
  | "regional-gated" // RFC-0240
  | "invalid-freshness" // RFC-0274
  | "missing-evidence" // RFC-0274
  | "missing-demand" // RFC-0280
  | "missing-werk-evidence" // RFC-0281
  | "navigation-noindex" // RFC-0324
  | "redirect-stub"
  | "duplicate"; // RFC-0274

/** The composed indexability decision for a generated page. Later RFCs fill the optional gates. */
export interface IndexDecision {
  recordGate: boolean;
  substanceGate?: boolean;
  evidenceGate?: boolean;
  demandGate?: boolean;
  duplicateGate?: boolean;
  withinBudget?: boolean;
  fresh?: boolean;
  indexable: boolean;
  noindex: boolean;
  reason?: IndexReason;
  /** RFC-0194: the page substance score (0..100) that informed the substance gate. */
  substanceScore?: number;
  /** RFC-0281: count of consented Werk records backing this tuple. */
  werkEvidenceCount?: number;
}

/** One materialized generated route. The single unit the registry merge consumes. */
export interface VirtualRouteEntry {
  /** Owning Blueprint id (e.g. "website-local"). */
  surfaceId: string;
  /** Synthetic stable page id, e.g. "website-local:elektriker:berlin". */
  pageId: string;
  /** lang → localized slug. */
  routes: Record<string, string>;
  axes: AxisTuple;
  depth: number;
  recordCount: number;
  indexable: boolean;
  noindex: boolean;
  /** For non-live (redirect-stub) entries: the live ancestor pageId to 301 to. */
  redirectToPageId?: string;
  /** For live noindex navigation pages: pageId whose URL should be rendered as canonical. */
  canonicalPageId?: string;
  /** Semantic page type for JSON-LD / OG meta (defaults to "content"). */
  semanticType?: string;
  /**
   * RFC-0325: dated-editorial article metadata, present when `semanticType` is "article". Mirrors
   * the system.md `pages[].article` shape exactly so the RFC-0317 update-stamp resolver
   * (`resolveAuthoredStamp`) and the Astro render layer's Article/BlogPosting JSON-LD wiring work
   * for a Programmatic Surface page without any source-specific branching.
   */
  article?: {
    publishedAt: string;
    updatedAt?: string;
    author?: string;
    tags?: string[];
  };
  /** RFC-0195: per-depth GEO contribution — "full" (llms.txt + twin), "twin-only", "off". */
  geo?: "full" | "twin-only" | "off";
  /**
   * Optional page-level site-background image name (resolved via the app's content assets, same as
   * an authored page's `shell.background` imageName in system.md). When set, the page handler renders
   * a shell-layer background instead of the generic `home-bg` default. Omit for the default.
   */
  backgroundImage?: string;
  /**
   * RFC-0192: the resolved page. In "inline" bake mode it carries the full blocks. In "lazy" mode it
   * carries only metadata (title/description, empty blocks) and the full page lives in its own file
   * (`.surface-cache/<pageId>.yaml`), loaded on demand at render.
   */
  page?: PageEntry;
  /**
   * RFC-0193: per-language baked pages (multilingual surfaces). Keyed by lang. `page` mirrors the
   * default-language entry here. Language-neutral consumers (substance, counts) use `page`; per-lang
   * consumers (render, Markdown twins, llms.txt) use `pages[lang] ?? page`.
   */
  pages?: Record<string, PageEntry>;
  /** RFC-0192: true when the full page blocks live in a per-page file (lazy bake). */
  lazy?: boolean;
  /**
   * RFC-0207: non-default languages whose localized page was omitted because its baked content fell
   * back to the default language (no native record fields and no approved narrative). Their `routes`
   * + `pages` entries are dropped, so the de-fallback page never renders under a localized URL, is
   * never indexed, and never enters the sitemap/hreflang/twins. surface.validate reports each as an
   * `untranslated-route` error. Reversible: supply native content (or an approved narrative) and the
   * route reappears on the next generate.
   */
  untranslatedLangs?: string[];
  /** Decision provenance for the manifest (RFC-0194/0196 enrich this). */
  decision?: IndexDecision;
}

/**
 * The closed route-source port. One implementation per Blueprint (RFC-0193).
 * `enumerate` runs at build time (Node); `resolve` may run at build time (baked) or render time.
 */
export interface PageSurfaceProvider {
  readonly id: string;
  enumerate(lang: string): Promise<VirtualRouteEntry[]>;
  resolve(entry: VirtualRouteEntry, lang: string): Promise<PageEntry>;
}

/** Per-surface generation counts (written into pseo-manifest.json). */
export interface SurfaceCounts {
  surfaceId: string;
  generated: number;
  indexable: number;
  noindex: number;
  redirected: number;
  /** RFC-0194: live pages suppressed by the substance gate. */
  thin?: number;
  /** RFC-0194: median Page Substance Score across live pages. */
  medianSubstance?: number;
  /** RFC-0324: legacy composite score retained for diagnostics while medianSubstance is unique-share. */
  legacyMedianSubstanceScore?: number;
  /** RFC-0324: distribution of unique token share across non-redirect generated pages. */
  uniqueTokenShareBands?: {
    lt030: number;
    gte030lt050: number;
    gte050: number;
  };
  /** RFC-0195: Markdown twins emitted (GEO corpus). */
  twins?: number;
  /** RFC-0195: pages contributing to llms.txt (GEO depth "full"). */
  inLlms?: number;
}

/** The pseo-manifest.json payload. */
export interface SurfaceManifest {
  generatedAt: string | null;
  surfaces: SurfaceCounts[];
}

/** The src/surface.generated.yaml payload consumed by the runtime registry merge. */
export interface SurfaceArtifact {
  generatedAt: string | null;
  entries: VirtualRouteEntry[];
}

/** RFC-0492: structured dossier fields for depth-1 industry records. */
export interface IndustryDossierFields {
  customerQuestions?: string[];
  customerJourneys?: Array<{ title: string; stages: string[] }>;
  serviceTaxonomy?: Array<{ category: string; description: string }>;
  trustSignals?: string[];
  evidenceRequirements?: string[];
  contactModes?: string[];
  serviceAreaModel?: string;
  recommendedArchitecture?: Array<{ page: string; description: string }>;
  suitableModules?: Array<{ module: string; applicability: string }>;
  notdienst?: boolean;
  industryFaq?: Array<{ question: string; answer: string }>;
}
