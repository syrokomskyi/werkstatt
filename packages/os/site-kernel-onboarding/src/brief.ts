/*
<MODULE_CONTRACT>
<purpose>Defines and validates the RFC-0070 onboarding brief contract from onboarding/<system-id>/.input/00-brief.md (RFC-0532).</purpose>
<non-goals>
  <item>Do not scaffold apps or infer derived ecosystem choices like biome or constellation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0070: Add onboarding brief schema and validator command.</item>
  <item>RFC-0532: Update path references from onboarding/.input/ to onboarding/<system-id>/.input/. Remove apps/<id>/ cross-check, add systems/registry.yaml check.</item>
  <item>RFC-0532 review fix: Remove dead runBriefValidate function and all its helpers (brief.validate command removed).</item>
</CHANGE_SUMMARY>
*/

import matter from "gray-matter";
import { z } from "zod";
import YAML from "yaml";

export const BriefFrontmatter = z
  .object({
    client: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),
      domain: z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/),
    }),
    i18n: z
      .object({
        default: z.string().regex(/^[a-z]{2}$/),
        supported: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
      })
      .refine((value) => value.supported.includes(value.default), {
        message: "i18n.supported must contain i18n.default",
        path: ["supported"],
      }),
    legalJurisdiction: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

export type Brief = z.infer<typeof BriefFrontmatter>;

export function parseBriefFrontmatter(source: string): Brief {
  const parsed = matter(source);
  return BriefFrontmatter.parse(parsed.data);
}

export function parseSystemFrontmatter(source: string): Record<string, unknown> {
  return matter(source).data as Record<string, unknown>;
}

export function parseMarkdownAsYaml(source: string): Record<string, unknown> {
  return YAML.parse(source) as Record<string, unknown>;
}
