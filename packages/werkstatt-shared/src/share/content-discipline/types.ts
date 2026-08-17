/*
<MODULE_CONTRACT>
<purpose>Defines RFC-0073 shared content-discipline contracts for atom coverage, voice profile, and unplaced-atom reasoning.</purpose>
<non-goals>
  <item>Do not read files from disk.</item>
  <item>Do not perform app-specific validation logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Introduce shared content-discipline contracts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const contentAtomIntentValues = [
  "heading",
  "subheading",
  "body",
  "lead",
  "cta-primary",
  "cta-secondary",
  "trust",
  "proof",
  "stat-value",
  "stat-label",
  "faq-question",
  "faq-answer",
  "meta-title",
  "meta-description",
  "og-title",
  "og-description",
  "legal-prose",
  "process-step",
  "comparison-row",
  "microcopy",
  "error-message",
  "confirmation",
  "placeholder",
  "consent",
] as const;

export const unplacedReasonValues = [
  "legal-deferred",
  "redundant",
  "out-of-scope-for-mvp",
  "client-deprecated",
  "quality-concern",
] as const;

export const contentAtomIntentSchema = z.enum(contentAtomIntentValues);
export const unplacedReasonSchema = z.enum(unplacedReasonValues);

export const contentAtomSchema = z
  .object({
    id: z.string().regex(/^atom-\d{4,}$/),
    sourceId: z.string().min(1),
    sourceLines: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    intent: contentAtomIntentSchema,
    pageHint: z.string().min(1),
    sectionHint: z.string().min(1),
    faqQuestion: z.string().min(1).optional(),
    paraphraseOf: z
      .string()
      .regex(/^atom-\d{4,}$/)
      .optional(),
    text: z.string().min(1),
  })
  .strict();

export const contentAtomsFileSchema = z
  .object({
    // RFC-0082: payload is read via parseOnboardingArtifactPayload, which strips
    // RFC-0076 metadata keys before validation, so .strict() is safe again.
    client: z.string().min(1),
    language: z.string().regex(/^[a-z]{2}$/),
    materialsHash: z.string().min(1),
    generatedAt: z.string().min(1),
    atoms: z.array(contentAtomSchema),
  })
  .strict();

export const preferredPhrasingSchema = z
  .object({
    avoid: z.string().min(1),
    prefer: z.string().min(1),
  })
  .strict();

export const voiceProfileSchema = z
  .object({
    // RFC-0082: payload is read via parseOnboardingArtifactPayload, which strips
    // RFC-0076 metadata keys before validation, so .strict() is safe again.
    client: z.string().min(1),
    language: z.string().regex(/^[a-z]{2}$/),
    register: z.enum(["Sie", "Du", "you", "informal"]),
    forbiddenPhrases: z.array(z.string().min(1)).default([]),
    preferredPhrasings: z.array(preferredPhrasingSchema).default([]),
    mandatoryPhrases: z.array(z.string().min(1)).default([]),
    allowedQuotes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const coverageLedgerEntrySchema = z
  .object({
    atomId: z.string().regex(/^atom-\d{4,}$/),
    reason: unplacedReasonSchema,
    note: z.string().min(1),
  })
  .strict();

export type ContentAtomIntent = z.infer<typeof contentAtomIntentSchema>;
export type ContentAtom = z.infer<typeof contentAtomSchema>;
export type ContentAtomsFile = z.infer<typeof contentAtomsFileSchema>;
export type UnplacedReason = z.infer<typeof unplacedReasonSchema>;
export type PreferredPhrasing = z.infer<typeof preferredPhrasingSchema>;
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;
export type CoverageLedgerEntry = z.infer<typeof coverageLedgerEntrySchema>;
