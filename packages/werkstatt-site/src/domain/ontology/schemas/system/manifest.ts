/*
<MODULE_CONTRACT>
<purpose>Top-level system manifest schema (RFC-0025): binds a client application to a cosmic identity, a single Biome, and optional Constellations.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from schemas/system.ts as part of the domain split.</item>
  <item>RFC-0377: added optional `audience` field to the per-page pin schema.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

import { systemSharedContextSchema, systemGrowthSchema } from "./growth.ts";
import { systemReleaseSchema } from "./release.ts";
import { systemTextSchema } from "./text.ts";
import { systemIntegrationsSchema } from "./integrations.ts";
import { semanticPageTypeSchema, articleMetadataSchema, pageOutputSchema } from "./page-output.ts";

/**
 * The per-app system.yaml manifest. Binds the client app to its cosmic identity.
 * One file per app — stored at apps/<app-slug>/system.yaml.
 *
 * Constraints enforced here (structural):
 *   - identity.biome is a scalar (single biome per app — multi-biome is permanently forbidden)
 *   - constellations references are kebab-case slugs matching files in packages/werkstatt-site/src/domain/ontology/constellations/
 *
 * Cross-file constraints (enforced by validators, not this schema):
 *   - identity.systemStar must match a StarCatalog entry used in one page manifest
 *   - identity.biome must match an existing biome YAML id
 *   - constellations[] entries must resolve to existing constellation YAMLs
 */
export const systemManifestSchema = z.object({
  /**
   * Stable kebab-case slug for this app — matches the apps/<slug>/ directory name.
   * Example: "my-app"
   */
  app: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, "app must be kebab-case (lowercase letters, digits, hyphens)"),

  /**
   * Semantic version of this system manifest.
   */
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i, "version must be valid semver"),

  /**
   * Cosmic identity block — assigns this app its place in the cosmic overlay.
   */
  identity: z.object({
    /**
     * The IAU star name that identifies the "home star" of this system.
     * Must match a StarCatalog entry that is also used as the cosmicName
     * of at least one page manifest in this app.
     * Validated cross-file by system.manifest.validate.
     */
    systemStar: z.string().min(1),

    /**
     * The single Biome applied to this app.
     * Must match a biome id from packages/werkstatt-site/src/domain/ontology/biomes/.
     * Multi-biome per app is permanently forbidden (DNA-23, RFC-0025).
     * Validated cross-file by biome.contract.validate.
     */
    biome: z.string().min(1),

    /**
     * Human-readable tagline for this system, shown in the Cosmic Passport.
     * Example: "Building a better future for local communities"
     */
    tagline: z.string().min(1).optional(),

    /**
     * Canonical FQDN for this app (without protocol or path).
     * Mirrors client.domain from onboarding/.input/00-brief.md so that
     * brief.validate can cross-check the brief against the running app identity.
     */
    domain: z.string().min(1).optional(),
  }),

  /**
   * Internationalization configuration (RFC-0038).
   * Declares default language and supported language map.
   */
  i18n: z
    .object({
      default: z.string().min(1),
      supported: z.record(z.string(), z.any()),
    })
    .optional(),

  /**
   * Constellations (composition patterns) active in this app.
   * Each entry is a kebab-case slug matching a file in packages/werkstatt-site/src/domain/ontology/constellations/.
   * Validated cross-file by constellation.compose.validate.
   * Empty array = no composition-pattern validation is performed.
   */
  constellations: z
    .array(z.string().regex(/^[a-z][a-z0-9-]*$/, "constellation slug must be kebab-case"))
    .optional()
    .default([]),

  /**
   * Client-editable surface declarations — kebab-case keys of content sections
   * that the client may edit without engineering involvement (DNA-22, RFC-0025).
   * Validated by client.edit.validate at deploy time.
   */
  clientEditable: z.array(z.string().min(1)).optional().default([]),

  sharedContext: systemSharedContextSchema.optional(),

  /**
   * Per-page composition pins (RFC-0026, RFC-0048).
   * Each entry pins the section versions active for a given page.
   * Validated by page.block.validate — every blocks[].use in page content must
   * appear in the matching pageId's planets[] list.
   */
  pages: z
    .array(
      z.object({
        /**
         * RFC-0048: Stable page identifier across languages (e.g., "privacyPolicy").
         * Used as the canonical key for page lookup and route resolution.
         */
        pageId: z.string().min(1),

        /**
         * RFC-0048: Language-keyed route slugs (e.g., { de: "datenschutz", en: "privacy" }).
         * Maps each supported language to its localized URL slug.
         */
        routes: z.record(z.string(), z.string()).optional(),

        /**
         * RFC-0048 (legacy): URL route path for this page (e.g. "/", "/spenden").
         * Kept for backward compatibility during migration; use pageId + routes instead.
         */
        route: z.string().min(1).optional(),

        /**
         * RFC-0097: Explicit locale opt-in. When set, the page exists only in
         * these locales — runtime resolvers, getStaticPaths, and the
         * language-switcher all short-circuit silently for locales outside
         * the set. Use for pages whose existence is locale-dependent
         * (Impressum is DE/AT/CH-only; US-specific privacy pages are en-only).
         * Each entry must be a key of `i18n.supported`; cross-validation lives
         * in `system.contract.validate`.
         */
        locales: z.array(z.string().min(1)).optional(),

        /**
         * RFC-0042/RFC-0050: semantic role of the page. Optional — pages without
         * a semanticType do not enter the semantic model (no JSON-LD / llms output).
         */
        semanticType: semanticPageTypeSchema.optional(),

        /**
         * RFC-0377: optional audience override for this page. When absent, the twin generator
         * falls back to the SemanticPageType derivation map (AUDIENCE_BY_PAGE_TYPE).
         */
        audience: z.string().min(1).optional(),

        /**
         * RFC-0229: optional parent pageId for the breadcrumb hierarchy. When set, the page's
         * breadcrumb trail becomes Home → …parent chain… → self instead of the flat Home → self.
         * The referenced pageId must exist in this `pages[]` list and the chain must be acyclic —
         * `breadcrumb.trail.validate` enforces both. Omit for top-level pages (Home → self).
         */
        parentPageId: z.string().min(1).optional(),

        /**
         * Standalone page: exists in the route registry for link/semantic-target
         * resolution but is rendered by a dedicated .astro file (not [...slug].astro).
         * Excluded from getStaticPathsForDefaultLang to avoid route conflicts.
         */
        standalone: z.boolean().optional(),

        /**
         * RFC-0143: per-page output projection container (sitemap, llms, …).
         * Closed object — only known generator keys are accepted.
         */
        output: pageOutputSchema.optional(),

        /** RFC-0167: article metadata — when present, the page emits Article JSON-LD. */
        article: articleMetadataSchema.optional(),

        /**
         * The cosmicName of the page archetype from StarCatalog.
         * Must match the cosmicName of the page's manifest.yaml.
         */
        cosmicStar: z.string().min(1),

        /**
         * Optional constellation slug for this page.
         * When present, constellation.compose.validate checks that the page's
         * planets match the constellation's required slots.
         */
        constellation: z.string().optional(),

        /**
         * Optional shell block configuration for this page.
         * Controls page-level shell elements like background.
         */
        shell: z
          .object({
            background: z
              .object({
                enabled: z.boolean(),
                cosmicMoon: z.string().min(1),
                pin: z.string().min(1),
                props: z.record(z.string(), z.any()).optional(),
              })
              .optional(),
          })
          .optional(),

        /**
         * Ordered list of planet section pins active on this page.
         * Each cosmicPlanet must appear in PlanetCatalog and be used
         * in the page's block-declarative content.
         */
        planets: z
          .array(
            z.object({
              /** PlanetCatalog name for this section archetype. */
              cosmicPlanet: z.string().min(1),
              /**
               * Semver pin against packages/ui section version.
               * "latest" is accepted at MVP for apps without strict version pins.
               */
              pin: z.string().min(1),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .optional()
    .default([]),

  /**
   * Growth layer binding (RFC-0027).
   * When absent, the growth layer is inactive and <GrowthProvider> is omitted.
   * When present, growth.vendor.adapter determines which adapter is loaded on the client.
   */
  growth: systemGrowthSchema.optional(),

  /**
   * Release configuration (RFC-0028).
   * Controls Cosmic Passport, Star Map, and Pulsar heartbeat.
   * When absent, passport page is not rendered but passport.json is still emitted.
   */
  release: systemReleaseSchema.optional(),

  /**
   * RFC-0235: egress text normalization. Strips AI-authorship typographic
   * signals from all public output at build egress. Adapter, not source rewrite.
   * Absent ⇒ all signals on. Client-writable.
   */
  text: systemTextSchema.optional(),

  /**
   * RFC-0169: subscription billing binding. `billing.stripeCustomerId` is the
   * Stripe customer whose active Entitlements gate this site's paid modules.
   */
  billing: z
    .object({
      stripeCustomerId: z.string().min(1).optional(),
      // RFC-0196: offline/dogfood Programmatic Surface index budget (top-K indexable pages by
      // substance). With Stripe, the budget is derived from the tier lookup-key (PSEO_TIER_BUDGET).
      pseoIndexBudget: z.number().int().min(0).optional(),
      // RFC-0240: offline/dogfood regional-hub-or-higher pseo tier unlock (unlocks d3 region hubs).
      // With Stripe, this is derived from the active tier lookup-key (PSEO_REGIONAL_TIERS).
      pseoRegionalUnlocked: z.boolean().optional(),
    })
    .optional(),

  /**
   * RFC-0169: offline entitlement override for dev/CI (deterministic, no network).
   * When present, wins over Stripe resolution.
   */
  entitlementsOverride: z.array(z.string().min(1)).optional(),

  /**
   * RFC-0193: explicit Programmatic Surface adoption. `surface.blueprints` lists the Blueprint ids
   * (in packages/werkstatt-site/src/domain/ontology/blueprints/) this site compiles. When declared, only listed Blueprints
   * apply (and blueprint.validate requires their datasets). When omitted, the engine falls back to
   * implicit opt-in by datasets (a Blueprint applies if the app ships its dataset collection).
   */
  surface: z.object({ blueprints: z.array(z.string().min(1)).optional() }).optional(),

  /**
   * RFC-0211..0218: Content Knowledge Lifecycle policy. `freshness.soonWindowDays`
   * sets the expiring-soon horizon; `freshness.critical` maps subject-address globs
   * to a criticality so the maintenance-plan gate (RFC-0216) can promote selected
   * facts (e.g. price, legal) from advisory amber to blocking red.
   */
  knowledge: z
    .object({
      freshness: z
        .object({
          soonWindowDays: z.number().int().positive().optional().default(30),
          critical: z
            .array(
              z.object({
                match: z.string().min(1),
                criticality: z.enum(["advisory", "important", "blocking"]),
              }),
            )
            .optional()
            .default([]),
        })
        .optional(),
      derivation: z
        .object({
          critical: z
            .array(
              z.object({
                match: z.string().min(1),
                criticality: z.enum(["advisory", "important", "blocking"]),
              }),
            )
            .optional()
            .default([]),
        })
        .optional(),
      /**
       * RFC-0216: maintenance-plan policy. Controls how the planner schedules and
       * routes tasks: leadTimeDays (how far before validUntil a task is raised),
       * the default owner for tasks the claim does not name, and a glob→criticality
       * map that promotes specific subjects above their trigger's default.
       */
      plan: z
        .object({
          leadTimeDays: z.number().int().positive().optional().default(30),
          defaultOwner: z.string().min(1).optional(),
          criticalityMap: z
            .array(
              z.object({
                match: z.string().min(1),
                criticality: z.enum(["advisory", "important", "blocking"]),
              }),
            )
            .optional()
            .default([]),
        })
        .optional(),
    })
    .optional(),

  /**
   * RFC-0171: content-source adapter selection (Content Source Provider port).
   * Defaults to the filesystem adapter; CMS adapters are opt-in per app.
   */
  contentSource: z
    .object({
      adapter: z.enum(["fs", "cms-git", "cms-api"]).default("fs"),
      options: z.record(z.string(), z.string()).optional(),
    })
    .optional(),

  /**
   * RFC-0168: Integration Port configuration (outbound channels + optional CRM).
   * When absent, channels self-enable by secret presence and the integration
   * validators are a no-op pass.
   */
  integrations: systemIntegrationsSchema.optional(),

  /**
   * RFC-0182: Deployment and infrastructure residency configuration.
   * Declares Cloudflare Regional Services policy and allowed execution zones.
   */
  deployment: z
    .object({
      cloudflare: z
        .object({
          /**
           * Hostnames to validate for Regional Services.
           * Defaults to [identity.domain] when empty.
           */
          hostnames: z.array(z.string().min(1)).optional().default([]),
          /**
           * Regional Services policy — empty array means all zones acceptable.
           */
          regionalServices: z
            .object({
              allowedZones: z
                .array(z.enum(["eu", "us"]))
                .optional()
                .default([]),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),

  /**
   * RFC-0257: App-level output projection. Controls build-time artifact generation
   * that applies to the whole app, not individual pages.
   */
  output: z
    .object({
      /** Enable SSG PDF generation via Playwright during build.post. Default false. */
      printPdf: z.boolean().optional(),
    })
    .optional(),

  /**
   * RFC-0286: Agent Surface policy. Absent ⇒ enabled: true — the read tier
   * (knowledge files, discovery, OpenAPI; RFC-0287/0289) is free visibility like
   * llms.txt. Set `enabled: false` to disable the whole agent surface for a site.
   */
  agent: z
    .object({
      enabled: z.boolean().optional(),
      /** RFC-0287: domains to withhold from the knowledge tier even if content exists. */
      knowledgeDisabled: z.array(z.string().min(1)).optional(),
      /** RFC-0288: capability ids to withhold from the action tier even if otherwise active. */
      actionsDisabled: z.array(z.string().min(1)).optional(),
    })
    .strict()
    .optional(),

  /**
   * RFC-0487: Business model declaration. Closed enum — currently only "b2b-only".
   * When declared, b2b.model.validate checks that no B2C-specific page IDs, route
   * slugs, navigation labels, or consumer-law prose references exist.
   * Future RFCs may add values (b2c, marketplace) as needed.
   */
  businessModel: z.enum(["b2b-only"]).optional(),

  /**
   * RFC-0487/RFC-0509: Retired page routes — declarative audit trail of removed page slugs.
   * The _redirects generator reads this and emits HTTP 410 Gone tombstones or 301 redirects.
   * When status is 301, `to` is required and specifies the redirect target URL path.
   * When status is 410, `to` is forbidden (tombstone has no redirect target).
   */
  retiredRoutes: z
    .array(
      z.union([
        z.object({
          slug: z.string().min(1),
          status: z.literal(410),
        }),
        z.object({
          slug: z.string().min(1),
          status: z.literal(301),
          to: z.string().min(1),
        }),
      ]),
    )
    .optional()
    .default([]),
});

export type SystemManifest = z.infer<typeof systemManifestSchema>;

/** A single page route pin entry from system.yaml pages[]. */
export type SystemPagePin = NonNullable<SystemManifest["pages"]>[number];
/** A single planet pin within a page-route entry. */
export type SystemPlanetPin = NonNullable<SystemManifest["pages"][number]["planets"]>[number];
