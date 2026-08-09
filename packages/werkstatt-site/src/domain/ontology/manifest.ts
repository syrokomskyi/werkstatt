/*
<MODULE_CONTRACT>
<purpose>
Zod schema for manifest.yaml — the colocated per-component/section/page metadata
file that forms the fifth leg of the Mirror Quintet (DNA-17, RFC-0023).
Exports a discriminated union on `layer` so TypeScript narrows the `role` and
`cosmicName` fields to the correct closed enum automatically.
</purpose>
<non-goals>
  <item>Do not parse YAML here — the caller (manifest.contract.validate command
        and uni.registry.build) is responsible for reading the file and passing
        the parsed object to manifestSchema.parse().</item>
  <item>Do not hard-code file paths. The schema is path-agnostic.</item>
  <item>Do not add business-shaped fields (company, services, etc.) — those
        belong in @warpgogol/werkstatt-site/pbp schemas (RFC-0024, RFC-0471).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation as part of Wave 1 (RFC-0023 rollout).</item>
  <item>Wave 1 (RFC-0025): Added required cosmicName per layer — StarName for pages,
        PlanetName for sections, MoonName for components (DNA-23).</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { layerSchema, componentRoleSchema, industrySchema } from "./enums.ts";
import { starNameSchema } from "./cosmic/star-catalog.ts";
import { planetNameSchema } from "./cosmic/planet-catalog.ts";
import { moonNameSchema } from "./cosmic/moon-catalog.ts";

// ---------------------------------------------------------------------------
// Intent (open vocabulary)
// ---------------------------------------------------------------------------

/**
 * Well-known intent strings for manifest.yaml `intent[]` fields.
 *
 * Intent is an OPEN vocabulary (typed as string). This list is advisory:
 * it documents the canonical phrases in active use and enables autocomplete,
 * but it is NOT enforced as a closed enum (DNA-19). New intents may be added
 * locally without an RFC.
 *
 * Intents describe *user goals* this component serves, not its technical role.
 */
export const KNOWN_INTENTS = [
  // Conversion / acquisition
  "convert-visitor",
  "capture-lead",
  "drive-contact",
  "drive-booking",
  "drive-donation",
  // Trust / credibility
  "build-trust",
  "show-social-proof",
  "demonstrate-expertise",
  "signal-transparency",
  // Identity / differentiation
  "establish-identity",
  "clarify-positioning",
  "explain-approach",
  "articulate-problem",
  "highlight-impact",
  // Navigation / discovery
  "guide-navigation",
  "orient-visitor",
  "surface-content",
  // Team / human connection
  "introduce-team",
  "humanise-brand",
  // Legal / compliance
  "fulfill-legal-requirement",
  "display-compliance",
] as const;

export type KnownIntent = (typeof KNOWN_INTENTS)[number];

// ---------------------------------------------------------------------------
// Semver helper
// ---------------------------------------------------------------------------

const semverPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i;
const semverSchema = z
  .string()
  .regex(semverPattern, "version must be a valid semver string (e.g. 1.0.0)");

// ---------------------------------------------------------------------------
// Kebab-case helper
// ---------------------------------------------------------------------------

const kebabPattern = /^[a-z][a-z0-9-]*$/;
const kebabSchema = z
  .string()
  .regex(kebabPattern, "Must be kebab-case (lowercase letters, digits, hyphens)");

const archetypeIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/,
    "archetype must be kebab-case segments separated by dots",
  );

// ---------------------------------------------------------------------------
// Shared base schema
// ---------------------------------------------------------------------------

/**
 * Fields common to all three manifest layers (page | section | component).
 * `layer` and `role` are declared per-layer to enable discriminated union narrowing.
 */
const manifestBaseSchema = z.object({
  /**
   * Unique stable identifier for this UI atom in the Uni registry.
   * Format: <semantic-id>[-<variant>]-<layer-suffix>
   * Examples: "hero-section", "footer-component", "home-page"
   */
  id: kebabSchema,

  /**
   * Display/marketing name for the Uni UI Ontology.
   * At MVP this equals `semanticId` (RFC-0023 nonGoal). A future naming RFC
   * may assign distinct values (e.g. "Beacon" for a hero section variant).
   */
  uniName: z.string().min(1),

  /**
   * The kebab-case semantic identifier matching the component's filename stem.
   * Examples: "hero", "final-cta", "footer", "person-profile"
   */
  semanticId: kebabSchema,

  /**
   * RFC-0072 stable archetype identifier used to bind manifests to the central
   * archetype catalog in packages/werkstatt-site/src/domain/ontology/archetypes/sections/.
   * Supports grouped ids such as "shell.header".
   */
  archetype: archetypeIdSchema,

  /**
   * SemVer version string. Patch = backwards-compatible content change.
   * Minor = new optional props. Major = breaking prop/schema change.
   */
  version: semverSchema,

  /**
   * Open-vocabulary list of user-goal phrases this component serves.
   * Use values from KNOWN_INTENTS when possible; new values are allowed
   * without an RFC (DNA-19).
   */
  intent: z.array(z.string()).min(1, "At least one intent is required"),

  /**
   * Industry verticals for which this component is a natural fit.
   * Empty array = universally applicable.
   * Uses the closed Industry enum (DNA-19).
   */
  industryFit: z.array(industrySchema),

  /**
   * Key of the Zod content schema this component consumes.
   * Must match an export of @warpgogol/werkstatt-site/share or the app-local content/schemas/.
   * Set to null for structural components that consume no content schema
   * (e.g. breadcrumbs, lang-switcher).
   */
  contentSchemaKey: z.string().nullable(),

  /**
   * When true, this component can be placed outside the standard
   * page → section → component hierarchy (DNA-8).
   * Example: a standalone <CookieBanner> injected at the layout level.
   * Default: false.
   */
  standalone: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Per-layer manifest schemas (discriminated union)
// ---------------------------------------------------------------------------

/**
 * Manifest for a page (layer = "page").
 * Pages may carry a descriptive role string but it is not validated
 * against a closed enum — pages are too varied to enumerate centrally.
 * cosmicName must be a value from the StarCatalog (DNA-23, RFC-0025).
 */
export const pageManifestSchema = manifestBaseSchema.extend({
  layer: z.literal(layerSchema.enum.page),
  /**
   * Optional page-type descriptor. Free-form at MVP.
   * Examples: "landing", "legal", "detail"
   */
  role: z.string().optional(),
  /**
   * The IAU star name assigned to this page in the cosmic overlay (DNA-23).
   * Must be a value from StarCatalog. Validated at deploy time by
   * cosmic.catalog.validate (unique per workspace).
   */
  cosmicName: starNameSchema,
});

/**
 * Manifest for a section (layer = "section").
 * Role is an open kebab-case string; cross-file validation against the
 * archetype-derived sectionRoles[] set is performed by
 * archetype.registry.validate (RFC-0084). The closed SemanticRoleValues
 * enum was retired because the archetype catalog is the actual source of
 * truth for permitted section semantic roles.
 * cosmicName must be a value from the PlanetCatalog (DNA-23, RFC-0025).
 */
export const sectionManifestSchema = manifestBaseSchema.extend({
  layer: z.literal(layerSchema.enum.section),
  role: z.string().min(1),
  /**
   * The IAU moon/dwarf-planet name assigned to this section in the cosmic overlay (DNA-23).
   * Must be a value from PlanetCatalog. Validated at deploy time by
   * cosmic.catalog.validate (unique per workspace).
   */
  cosmicName: planetNameSchema,
  /**
   * JSON Schema (draft-07 compatible) describing the props this section accepts.
   * Used by buildPage / page.block.validate to validate block props at build time (RFC-0026).
   * additionalProperties: false is enforced by page.block.validate — extra keys fail the build.
   * Omitting this field disables strict prop validation for this section (MVP: not all
   * sections have propsSchema yet; they will be added progressively in Wave 1 of RFC-0026).
   */
  propsSchema: z.record(z.string(), z.unknown()).optional(),

  /**
   * RFC-0101 + RFC-0102 + RFC-0103: list of shared fragment ids whose JSON
   * Schema properties are merged into `propsSchema` before validation runs.
   * Eliminates the 60–100 lines of duplicated visual/header/body schema that
   * every section manifest used to carry. Fragments are merged in declared
   * order; the manifest's local `propsSchema` (when present) wins over any
   * composed property. See packages/werkstatt-site/src/domain/ontology/src/shared-section-props/index.ts
   * for the catalog. Unknown ids fail manifest.contract.validate.
   */
  propsSchemaCompose: z
    .array(
      z
        .string()
        .regex(/^[a-z][a-z0-9-]*(@\d+)?$/, "must match `<id>` or `<id>@<version>` (RFC-0119)"),
    )
    .optional(),

  /**
   * RFC-0149: server API routes this section requires. When a site uses this
   * section, `api.routes.generate` emits a thin GENERATED Astro APIRoute at
   * `src/pages/api/<route>.ts` per entry (`export const prerender = false` +
   * a re-export of the section handler), and projects the entry's `secrets`
   * into the app's astro:env schema. Handler logic lives once in the section
   * package; sites carry only the re-export. Omit the field for sections with
   * no endpoint.
   */
  api: z
    .array(
      z.object({
        /** Route stem under src/pages/api/. Becomes /api/<route>. Kebab-case. */
        route: kebabSchema,
        /**
         * Bare-import specifier of the module exporting the Astro APIRoute
         * handlers, named for the HTTP method (`POST`, `GET`, …). The generated
         * route re-exports the handlers named for `methods`.
         */
        handler: z.string().min(1),
        /**
         * HTTP methods this endpoint serves. Each maps to an Astro APIRoute
         * export named for the uppercased method (e.g. `POST`) that the
         * generated route re-exports by name. Defaults to ["POST"] when omitted.
         */
        methods: z
          .array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]))
          .nonempty()
          .optional(),
        /**
         * Runtime secret env keys this endpoint reads via `astro:env/server`.
         * `api.routes.generate` projects the union of all used sections' secrets
         * into the app's generated astro:env schema (declared optional so a
         * missing secret degrades to the handler's error path). Kebab/SCREAMING
         * naming is the section's choice; keys must be valid env identifiers.
         */
        secrets: z
          .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/, "must be a SCREAMING_SNAKE_CASE env key"))
          .optional(),
      }),
    )
    .optional(),
});

/**
 * Manifest for a component (layer = "component").
 * Role is narrowed to the closed ComponentRole enum (DNA-19).
 * cosmicName must be a value from the MoonCatalog (DNA-23, RFC-0025).
 */
export const componentManifestSchema = manifestBaseSchema.extend({
  layer: z.literal(layerSchema.enum.component),
  role: componentRoleSchema,
  /**
   * The IAU small-moon name assigned to this component in the cosmic overlay (DNA-23).
   * Must be a value from MoonCatalog. Validated at deploy time by
   * cosmic.catalog.validate (unique per workspace).
   *
   * Passport-reserved names (Methone, Bianca, Klarissa, Adrastea, Despina) are
   * EXCLUSIVELY assigned to the five passport components in
   * packages/werkstatt-site/src/domain/ui/components/{passport-header,passport-provenance,
   * passport-score-grid,passport-star-map,pulsar} (RFC-0028, DNA-31).
   * Do not use these five names for any other component manifest.
   */
  cosmicName: moonNameSchema,
});

/**
 * Discriminated union of all three layer-specific manifest schemas.
 * This is the authoritative runtime validator for any parsed manifest.yaml.
 *
 * Usage:
 *   import { manifestSchema } from "@warpgogol/werkstatt-site/ontology/manifest";
 *   const manifest = manifestSchema.parse(parsedYaml);
 *   // manifest.layer narrows to "page" | "section" | "component"
 *   // manifest.role narrows accordingly
 */
// @ai-invariant: manifestSchema is the authoritative runtime validator for every
// manifest.yaml in packages/ui. It is a discriminated union on `layer` — adding
// a new layer requires extending the union. cosmicName must be drawn from the
// layer-appropriate closed catalog (StarCatalog/PlanetCatalog/MoonCatalog, DNA-23).
// Role values are closed enums per layer — do not invent ad-hoc roles.

export const manifestSchema = z.discriminatedUnion("layer", [
  pageManifestSchema,
  sectionManifestSchema,
  componentManifestSchema,
]);

// ---------------------------------------------------------------------------
// Exported TypeScript types
// ---------------------------------------------------------------------------

export type PageManifest = z.infer<typeof pageManifestSchema>;
export type SectionManifest = z.infer<typeof sectionManifestSchema>;
export type ComponentManifest = z.infer<typeof componentManifestSchema>;

/**
 * Union of all three manifest variants.
 * Use this when writing code that handles manifests of any layer.
 */
export type Manifest = z.infer<typeof manifestSchema>;
