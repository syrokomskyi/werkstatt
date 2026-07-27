/*
<MODULE_CONTRACT>
<purpose>
Closed-enum vocabulary for the Uni UI Ontology (RFC-0023, RFC-0024, DNA-17, DNA-19).
Exports four enums — SemanticRole, ComponentRole, Industry, Layer — as both Zod
enums (for runtime validation) and TypeScript types (for static typing).
</purpose>
<non-goals>
  <item>Do not export business-shaped schemas or loader logic — those live in
        @gogol/pbp (RFC-0024, RFC-0471).</item>
  <item>Do not add new enum values without a superseding RFC (DNA-19).</item>
  <item>Intent is intentionally NOT a closed enum; it lives in manifest.ts as
        z.string() with a known-good list comment.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation as part of Wave 1 (RFC-0023 rollout).</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

/**
 * Technical layer in the page hierarchy (DNA-17, DNA-8).
 * Matches the physical folder layout: pages/ | sections/ | components/
 *
 * CLOSED — adding a value requires a superseding RFC (DNA-19).
 */
export const LayerValues = ["page", "section", "component"] as const;
export const layerSchema = z.enum(LayerValues);
export type Layer = z.infer<typeof layerSchema>;

// ---------------------------------------------------------------------------
// SemanticRole (RFC-0084 — open, archetype-derived)
// ---------------------------------------------------------------------------

/**
 * The semantic role of a *section* (layer = "section").
 *
 * RFC-0084 retired the closed `SemanticRoleValues` enum that lived here. The
 * authoritative source of valid section roles is now the section archetype
 * catalog under `packages/ontology/archetypes/sections/*.yaml`. Each
 * archetype's `semanticRole` field contributes one valid value.
 *
 * - `sectionManifestSchema.role` is `z.string().min(1)` (open vocabulary).
 * - `archetype.registry.build` writes the derived `sectionRoles[]` set to
 *   `packages/ontology/archetypes/index.yaml`.
 * - `archetype.registry.validate` cross-checks every section manifest's
 *   `role` against that set with a closest-match hint on miss.
 *
 * Use `SemanticRole` (typed as `string`) where the intent is "any section
 * semantic role"; reach for the runtime catalog when a specific value list
 * is needed. The static union has no point because the catalog grows.
 */
export type SemanticRole = string;

// ---------------------------------------------------------------------------
// ComponentRole
// ---------------------------------------------------------------------------

/**
 * The role of a pure UI *component* (layer = "component").
 * These are structural/chrome components that are not sections.
 *
 * CLOSED — adding a value requires a superseding RFC (DNA-19).
 * RFC-0101..RFC-0106 expanded this enum with the canonical section framework
 * primitives.
 *
 * Value           | Meaning
 * --------------- | -------------------------------------------------------------------
 * header          | Page-level header wrapper
 * layout-shell    | Page <head> and <body> skeleton wrapper
 * breadcrumbs     | Breadcrumb trail component
 * footer          | Page-level footer wrapper
 * brand-label     | Logo / brand wordmark display
 * copyright       | Copyright notice line
 * lang-switcher   | Language selector control
 * footer-promo    | Promotional block inside footer
 * person-profile  | Individual person card / author bio
 * section-shell   | [RFC-0101] Canonical section wrapper (background, effects, density, tone, motion)
 * section-header  | [RFC-0102] Number + tone-segmented heading + optional subheading
 * section-body    | [RFC-0103] Canonical body content (list/split-list/stats/cards/paragraphs/comparison/rich)
 * section-cta     | [RFC-0104] Single CTA / CTA group primitive
 * section-image   | [RFC-0104] Authored image primitive with fade masks
 * site-background | [RFC-0105] Full-viewport background shell-layer component
 */
export const ComponentRoleValues = [
  "header",
  "layout-shell",
  "breadcrumbs",
  "footer",
  "brand-label",
  "copyright",
  "lang-switcher",
  "footer-promo",
  "person-profile",
  "section-shell",
  "section-header",
  "section-body",
  "section-cta",
  "section-image",
  "site-background",
] as const;

export const componentRoleSchema = z.enum(ComponentRoleValues);
export type ComponentRole = z.infer<typeof componentRoleSchema>;

// ---------------------------------------------------------------------------
// Industry
// ---------------------------------------------------------------------------

/**
 * Target industry verticals for the WGogol German market (RFC-0023).
 *
 * CLOSED — adding a value requires a superseding RFC (DNA-19).
 *
 * English identifier          | German display label
 * --------------------------- | ------------------------------------
 * trades-and-construction     | Handwerk & Bau
 * local-services              | Lokale Dienstleistungen
 * consulting-and-coaching     | Beratende Berufe
 * legal-services              | Recht & Kanzleien
 * non-profit                  | Non-Profit & Vereine
 * creative-studios            | Kreative Branchen & Studios
 */
export const IndustryValues = [
  "trades-and-construction",
  "local-services",
  "consulting-and-coaching",
  "legal-services",
  "non-profit",
  "creative-studios",
] as const;

export const industrySchema = z.enum(IndustryValues);
export type Industry = z.infer<typeof industrySchema>;

/**
 * German display labels for Industry values, keyed by the English identifier.
 * Use in UI dropdowns and documentation — not for content-layer comparisons.
 */
export const IndustryLabels: Record<Industry, string> = {
  "trades-and-construction": "Handwerk & Bau",
  "local-services": "Lokale Dienstleistungen",
  "consulting-and-coaching": "Beratende Berufe",
  "legal-services": "Recht & Kanzleien",
  "non-profit": "Non-Profit & Vereine",
  "creative-studios": "Kreative Branchen & Studios",
};
