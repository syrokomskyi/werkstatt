/*
<MODULE_CONTRACT>
<purpose>Webgogol check hints schema and parser: defines the hint configuration shape for check-webgogol runs.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for check-webgogol hints support.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const webgogolCheckHintsSchema = z.object({
  schemaVersion: z.literal(1),
  siteId: z.string().min(1),
  generatedAt: z.string().datetime(),
  baseUrl: z.string().url().optional(),
  languages: z.object({
    default: z.string().min(1),
    supported: z.array(z.string().min(1)).min(1),
  }),
  preferredStartPaths: z.array(z.string().startsWith("/")),
  sectionAnchors: z.array(
    z.object({
      path: z.string().startsWith("/"),
      sectionId: z.string().min(1),
      label: z.string().optional(),
    }),
  ),
  audienceProfiles: z.array(z.string().min(1)),
});

export type WebgogolCheckHints = z.infer<typeof webgogolCheckHintsSchema>;

export function parseWebgogolCheckHints(value: unknown): WebgogolCheckHints {
  return webgogolCheckHintsSchema.parse(value);
}
