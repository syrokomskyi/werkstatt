/*
<MODULE_CONTRACT>
<purpose>
Zod schema for block-declarative page content entries (DNA-24, RFC-0026).
Every page .md file under apps/<app>/src/content/pages/ must conform to PageEntrySchema.
Exports BlockEntrySchema and PageEntrySchema — pure declarative schemas, no I/O.
</purpose>
<non-goals>
  <item>Do not implement the buildPage pipeline here — that lives in @gogol/share/page.</item>
  <item>Do not parse YAML here; callers provide parsed objects to schema.parse().</item>
  <item>Do not validate cross-system.yaml references — that is page.block.validate's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation.</item>
  <item>Architecture review 2026-07-10: extracted getSectionPropsSchema into manifest-resolver.ts — page-entry.ts is now pure declarative schemas with no I/O.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { MoonCatalog, PlanetCatalog, StarCatalog } from "../cosmic/index.ts";

const PRINT_ORIENTATIONS = ["portrait", "landscape", "auto"] as const;
const PRINT_PAGE_SIZES = ["a4", "letter", "legal"] as const;
const PRINT_MARGINS = ["normal", "narrow", "none"] as const;
const PRINT_BACKGROUND_MODES = ["preserve", "flatten"] as const;
const PRINT_REGIONS = [
  "navigation",
  "breadcrumbs",
  "cta",
  "footer-links",
  "header-logo",
  "site-background",
  "hero-animation",
] as const;

// ---------------------------------------------------------------------------
// VisibilityExprSchema (re-declared here to avoid cross-package dep on @gogol/share)
// page.block.validate uses the canonical one from @gogol/share;
// the schema here is for Astro content-collection integration.
// ---------------------------------------------------------------------------

const visibilityExprSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.object({ feature: z.string().min(1) }),
    z.object({ locale: z.union([z.string().min(1), z.array(z.string().min(1))]) }),
    z.object({ segment: z.union([z.string().min(1), z.array(z.string().min(1))]) }),
    z.object({ flag: z.string().min(1) }),
    z.object({ all: z.array(visibilityExprSchema).min(1) }),
    z.object({ any: z.array(visibilityExprSchema).min(1) }),
    z.object({ not: visibilityExprSchema }),
  ]),
);

// ---------------------------------------------------------------------------
// BlockEntrySchema
// ---------------------------------------------------------------------------

/**
 * Schema for a single block inside a page content entry.
 *
 * `use` is validated against PlanetCatalog — only known planet names are allowed.
 * `props` is loose here (Record<string, unknown>); strict per-planet validation
 * against propsSchema runs at build time in page.block.validate.
 */
export const BlockEntrySchema = z
  .object({
    /**
     * Optional stable block identifier for analytics, anchor links, and
     * block-level attribution. Must be kebab-case when provided.
     * page.block.validate enforces uniqueness within a page.
     */
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/, "Block id must be kebab-case")
      .optional(),

    /**
     * Cosmic name identifying the section/component for this block.
     * Normally a `PlanetCatalog` value (section archetype). The five
     * **PASSPORT-RESERVED moons** (`Methone`, `Despina`, `Klarissa`, `Bianca`,
     * `Adrastea`) are also accepted because the cosmic-passport routes invoke
     * passport components as page-blocks (see RFC-0028). Other Moon names
     * remain rejected.
     * Must be pinned in system.yaml pages[route].planets[].
     */
    type: z.string().min(1).optional(),

    use: z
      .enum([
        ...PlanetCatalog,
        ...MoonCatalog.filter((m) =>
          ["Methone", "Despina", "Klarissa", "Bianca", "Adrastea"].includes(m),
        ),
      ] as [string, ...string[]])
      .optional(),

    /**
     * Props passed to the section component. Validated against the pinned
     * manifest's propsSchema (strict mode, no extra keys) by page.block.validate.
     * Loose here to allow Astro content-collections to parse the entry.
     */
    props: z.record(z.string(), z.unknown()).default({}),

    /**
     * Optional visibility expression. When absent the block is unconditionally visible.
     * Evaluated at build time by evalVisibility against the RuntimeContext.
     */
    visibility: visibilityExprSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.type && !data.use) {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: "Block selector is required; use author-facing `type` in page content",
      });
    }
  });

export type BlockEntry = z.infer<typeof BlockEntrySchema>;

// ---------------------------------------------------------------------------
// PageEntrySchema
// ---------------------------------------------------------------------------

/**
 * Schema for a block-declarative page content entry (DNA-24, RFC-0026).
 *
 * Stored at: apps/<app>/src/content/pages/<page-id>/<page-id>.<lang>.md
 * Format: YAML frontmatter only — no markdown body allowed (enforced by mirror.quintet.validate).
 *
 * Example:
 * ```yaml
 * kind: page
 * cosmicStar: Vega
 * title: "Startseite"
 * description: "Beispielorganisation — Bildung, Gesundheit, Solidarität."
 * lang: de
 * blocks:
 *   - id: hero
 *     use: Europa
 *     props:
 *       headline: "Bildung für Kinder in León"
 *       subline: "Seit 2008 — jeden Tag."
 * ```
 */
export const PageEntrySchema = z
  .object({
    /**
     * Discriminator identifying the entry kind.
     * - `page`: standard block-declarative page (must have ≥1 block).
     * - `redirect`: language-root redirect helper (no blocks required) — used by
     *   files like `src/content/pages/root-redirect.md` that resolve to a
     *   client-side redirect script rather than a rendered section sequence.
     */
    kind: z.enum(["page", "redirect"]).default("page"),

    /**
     * IAU star name for this page — must match a StarCatalog entry and
     * the cosmicName of the page's manifest.yaml.
     * Cross-reference against system.yaml is validated by page.block.validate.
     */
    cosmicStar: z.enum(StarCatalog),

    /** Page <title> and social/SEO title. */
    title: z.string().min(1),

    /** Page meta description for SEO and social cards. */
    description: z.string().min(1),

    /**
     * BCP-47 language code matching the file's language suffix (e.g. "de", "en").
     * The pipeline uses this as the locale for RuntimeContext.
     */
    lang: z.string().min(1),

    /**
     * Ordered list of blocks composing this page.
     * For `kind: page`, must have at least one block (enforced by superRefine).
     * For `kind: redirect`, may be empty.
     * Every `use` value must be pinned in system.yaml pages[route].planets[].
     * Props are validated against the pinned manifest's propsSchema by page.block.validate.
     */
    blocks: z.array(BlockEntrySchema).default([]),

    /**
     * RFC-0257: per-page print configuration. Optional — when absent, defaults
     * are applied by the print validators and PDF generator.
     */
    print: z
      .object({
        enabled: z.boolean().optional(),
        orientation: z.enum(PRINT_ORIENTATIONS).optional(),
        pageSize: z.enum(PRINT_PAGE_SIZES).optional(),
        margins: z.enum(PRINT_MARGINS).optional(),
        expandDetails: z.boolean().optional(),
        hide: z.array(z.enum(PRINT_REGIONS)).optional(),
        background: z.enum(PRINT_BACKGROUND_MODES).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "page" && data.blocks.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "A page must have at least one block",
      });
    }
  });

export type PageEntry = z.infer<typeof PageEntrySchema>;
