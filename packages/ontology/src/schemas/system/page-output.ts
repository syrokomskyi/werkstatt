/*
<MODULE_CONTRACT>
<purpose>Page output projection schema for the system manifest: controls per-page output settings like sitemap inclusion and canonical URLs.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from schemas/system.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * RFC-0042/RFC-0050: the semantic role of a page. Drives semantic model
 * construction and the default llms inclusion depth. Mirrors
 * SemanticPageType in @warpgogol/share/semantic.
 */
// NOTE: This enum is mirrored by the `SemanticPageType` union in
// `@warpgogol/share/src/semantic/models.ts`. The Zod schema here is the runtime
// validator for `system.md`; the TypeScript union in `share` is the
// compile-time contract. They are kept in sync manually to avoid a circular
// dependency between `ontology` and `share`.
export const semanticPageTypeSchema = z.enum([
  "home",
  "about",
  "projects",
  "donationContact",
  "openSource",
  "content",
  "article",
  "person",
  "participant",
  "legal",
  "collection",
]);

/** RFC-0167: per-page article metadata (Article/BlogPosting JSON-LD + dates + author). */
export const articleMetadataSchema = z
  .object({
    publishedAt: z.string().min(1),
    updatedAt: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .strict();

/** RFC-0142: per-page llms inclusion depth value (string shorthand or object). */
const llmsDepthSchema = z.enum(["full", "summary", "index-only", "exclude"]);
export const llmsPolicySchema = z.union([
  llmsDepthSchema,
  z
    .object({
      depth: llmsDepthSchema.optional(),
      sections: z.object({ exclude: z.array(z.string()).optional() }).optional(),
    })
    .strict(),
]);

/** RFC-0143: per-page sitemap projection value (boolean shorthand or object). */
export const sitemapProjectionSchema = z.union([
  z.boolean(),
  z
    .object({
      include: z.boolean().optional(),
      category: z.string().min(1).optional(),
      lastmod: z.string().min(1).optional(),
      includeLastmod: z.boolean().optional(),
    })
    .strict(),
]);

/**
 * RFC-0143: the per-page `output` block — a CLOSED container of per-page
 * projection generators. Each known generator owns exactly one key; unknown
 * keys are a validation error. A new per-page generator extends this schema
 * in the same change that adds the generator.
 */
/** RFC-0165: per-page robots/indexability (boolean shorthand or object). */
export const robotsProjectionSchema = z.union([
  z.boolean(),
  z
    .object({
      index: z.boolean().optional(),
      follow: z.boolean().optional(),
    })
    .strict(),
]);

export const pageOutputSchema = z
  .object({
    sitemap: sitemapProjectionSchema.optional(),
    llms: llmsPolicySchema.optional(),
    robots: robotsProjectionSchema.optional(),
    /** RFC-0257: enable SSG PDF generation for this app. Default false. */
    printPdf: z.boolean().optional(),
  })
  .strict();
