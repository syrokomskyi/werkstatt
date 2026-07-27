/*
<MODULE_CONTRACT>
<purpose>Site evidence graph schemas, finalization, parsing, and hash validation for the check-webgogol ecosystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
  <item>Migrated hash imports from deleted ./hash.ts wrapper to @gogol/fingerprint directly.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { byteHash, stableStringify } from "@gogol/fingerprint";

export const viewportEvidenceSchema = z.object({
  name: z.enum(["desktop", "mobile"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  screenshot: z.string().optional(),
});

export const sectionEvidenceSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  anchor: z.string().optional(),
  heading: z.string().optional(),
  text: z.string(),
  htmlHash: z.string(),
});

export const pageEvidenceSchema = z.object({
  url: z.string().url(),
  path: z.string().startsWith("/"),
  title: z.string().optional(),
  lang: z.string().optional(),
  canonical: z.string().optional(),
  metaDescription: z.string().optional(),
  text: z.string(),
  contentHash: z.string(),
  sections: z.array(sectionEvidenceSchema),
  viewports: z.array(viewportEvidenceSchema).min(1),
  links: z.array(z.string()),
});

export const siteEvidenceGraphSchema = z.object({
  schemaVersion: z.literal(1),
  targetId: z.string().min(1),
  baseUrl: z.string().url(),
  capturedAt: z.string().datetime(),
  pages: z.array(pageEvidenceSchema).min(1),
  graphHash: z.string(),
});

export type ViewportEvidence = z.infer<typeof viewportEvidenceSchema>;
export type SectionEvidence = z.infer<typeof sectionEvidenceSchema>;
export type PageEvidence = z.infer<typeof pageEvidenceSchema>;
export type SiteEvidenceGraph = z.infer<typeof siteEvidenceGraphSchema>;

export function finalizeEvidenceGraph(
  graph: Omit<SiteEvidenceGraph, "graphHash"> & { graphHash?: string },
): SiteEvidenceGraph {
  const withoutHash = { ...graph, graphHash: "" };
  return { ...graph, graphHash: byteHash(stableStringify(withoutHash)) };
}

export function parseEvidenceGraph(value: unknown): SiteEvidenceGraph {
  return siteEvidenceGraphSchema.parse(value);
}

export function validateEvidenceGraphHash(graph: SiteEvidenceGraph): boolean {
  return finalizeEvidenceGraph({ ...graph, graphHash: "" }).graphHash === graph.graphHash;
}
