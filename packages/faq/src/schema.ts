/*
<MODULE_CONTRACT>
<purpose>Zod schema and types for FAQ content entries (RFC-0475). Defines the
strict content contract for FAQ files at src/content/faq/{lang}/.</purpose>
<non-goals>
  <item>Does not define Astro collection wiring — that is astro.ts.</item>
  <item>Does not define semantic model types — those live in @warpgogol/share/semantic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0475: initial implementation — FAQ content schema with governance block.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const faqGovernanceSchema = z.object({
  fieldClaims: z
    .record(
      z.string(),
      z.object({
        provenance: z.enum(["asserted", "external", "inferred"]).optional(),
        asOf: z.string().optional(),
        confidence: z.enum(["high", "medium", "low"]).optional(),
      }),
    )
    .optional(),
});

export const faqSchema = z
  .object({
    slug: z.string(),
    question: z.string(),
    answer: z.string(),
    order: z.number().optional(),
    tags: z.array(z.string()).optional(),
    governance: faqGovernanceSchema.optional(),
  })
  .loose();

export type FaqEntry = z.infer<typeof faqSchema>;
export type FaqGovernance = z.infer<typeof faqGovernanceSchema>;
