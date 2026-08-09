/*
<MODULE_CONTRACT>
<purpose>
RFC-0480: Declarative Layer C external-surface contracts — URL schema,
JSON-LD types, and sitemap shape. Consumed by `surface.contract.validate`
in @warpgogol/site-kernel-handoff and by contract tests in @warpgogol/werkstatt-site/share.
</purpose>
<non-goals>
  <item>Do not generate C-surfaces here — this module only declares the contract.</item>
  <item>Do not import from @warpgogol/site-kernel-handoff or any app package.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0480: initial external-surfaces contracts (url-schema, jsonld-types, sitemap-shape).</item>
  <item>RFC-0498: add surfacePolicy to jsonldTypesContract — per-depth required/prohibited JSON-LD types for surface pages.</item>
  <item>RFC-0499: add mediaLeakagePolicy to jsonldTypesContract — prohibited strings, matching strategies, required labels for surface pages.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

const routeParamSchema = z.object({
  optional: z.boolean().optional(),
  enum: z.array(z.string()).optional(),
  type: z.string().optional(),
  from: z.string().optional(),
});

const routePatternSchema = z.object({
  pattern: z.string(),
  params: z.record(z.string(), routeParamSchema).optional(),
  generated: z.boolean(),
});

const localePrefixSchema = z.object({
  strategy: z.string(),
  default: z.string(),
});

const urlSchemaContract = z.object({
  routePatterns: z.array(routePatternSchema),
  localePrefix: localePrefixSchema,
});

const jsonldTypeSchema = z.object({
  "@type": z.string(),
  required: z.array(z.string()),
  optional: z.array(z.string()),
});

const surfacePolicyEntrySchema = z.object({
  surface: z.string(),
  depth: z.number(),
  requiredTypes: z.array(z.string()),
  prohibitedTypes: z.array(z.string()),
});

const mediaLeakageProhibitedStringSchema = z.object({
  pattern: z.string(),
  matchingStrategy: z.enum(["exact", "whole-word", "context-aware"]),
  contextSelector: z.string().optional(),
  reason: z.string(),
});

const mediaLeakageRequiredLabelSchema = z.object({
  label: z.string(),
  lang: z.string(),
});

const mediaLeakagePolicySchema = z.object({
  prohibitedStrings: z.array(mediaLeakageProhibitedStringSchema),
  requiredLabels: z.array(mediaLeakageRequiredLabelSchema),
  requiredLinkPattern: z.string(),
  aiImageAttribute: z.string(),
});

const jsonldTypesContract = z.object({
  types: z.array(jsonldTypeSchema),
  surfacePolicy: z.array(surfacePolicyEntrySchema).optional(),
  mediaLeakagePolicy: mediaLeakagePolicySchema.optional(),
});

const sitemapAlternatesSchema = z.object({
  required: z.array(z.string()),
  optional: z.array(z.string()),
});

const sitemapShapeContract = z.object({
  urlEntry: z.object({
    required: z.array(z.string()),
    optional: z.array(z.string()),
  }),
  alternates: sitemapAlternatesSchema,
});

// ---------------------------------------------------------------------------
// Contract loading
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadYaml<T>(filename: string): T {
  const filePath = path.join(__dirname, filename);
  const raw = readFileSync(filePath, "utf-8");
  return parseYaml(raw) as T;
}

export type UrlSchemaContract = z.infer<typeof urlSchemaContract>;
export type JsonldTypesContract = z.infer<typeof jsonldTypesContract>;
export type SitemapShapeContract = z.infer<typeof sitemapShapeContract>;
export type JsonldSurfacePolicyEntry = z.infer<typeof surfacePolicyEntrySchema>;
export type MediaLeakageProhibitedString = z.infer<typeof mediaLeakageProhibitedStringSchema>;
export type MediaLeakageRequiredLabel = z.infer<typeof mediaLeakageRequiredLabelSchema>;
export type MediaLeakagePolicy = z.infer<typeof mediaLeakagePolicySchema>;

/** Parsed and validated URL schema contract. */
export const urlSchema: UrlSchemaContract = urlSchemaContract.parse(loadYaml("url-schema.yaml"));

/** Parsed and validated JSON-LD types contract. */
export const jsonldTypes: JsonldTypesContract = jsonldTypesContract.parse(
  loadYaml("jsonld-types.yaml"),
);

/** Parsed and validated sitemap shape contract. */
export const sitemapShape: SitemapShapeContract = sitemapShapeContract.parse(
  loadYaml("sitemap-shape.yaml"),
);

// ---------------------------------------------------------------------------
// Re-exports for consumers
// ---------------------------------------------------------------------------

export {
  urlSchemaContract,
  jsonldTypesContract,
  sitemapShapeContract,
  routePatternSchema,
  jsonldTypeSchema,
  surfacePolicyEntrySchema,
  mediaLeakageProhibitedStringSchema,
  mediaLeakageRequiredLabelSchema,
  mediaLeakagePolicySchema,
};

/** All declarative C-contract files in this directory. */
export const EXTERNAL_SURFACE_CONTRACT_FILES = [
  "url-schema.yaml",
  "jsonld-types.yaml",
  "sitemap-shape.yaml",
] as const;
