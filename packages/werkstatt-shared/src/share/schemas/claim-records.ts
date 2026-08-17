/*
<MODULE_CONTRACT>
<purpose>
RFC-0505: the ratgeber claim record schema. A structured claim record at
`surface/claims/{lang}/*.md` with claimId, articleId, claimText, claimType,
sourceRefs, calculationInputs, limitations, verifiedAt, expiresAt, and
reviewStatus. This is the ratgeber-specific claim registry that replaces
the RFC-0502 claim sidecars for ratgeber articles.
</purpose>
<non-goals>
  <item>Do not validate claim records — the kernel validators (ratgeber.claim.validate) do that.</item>
  <item>Do not resolve sourceRefs or calculationInputs — the validators resolve them against source descriptors and PBP data.</item>
  <item>Do not confuse with recordClaimsSchema (RFC-0212) — that is the CKL claim sidecar for business records; this is the ratgeber claim record.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0505: initial claim record schema + type.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/** ISO 8601 calendar date, e.g. 2026-07-23. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().regex(ISO_DATE, "must be an ISO 8601 date (YYYY-MM-DD)");

/** A source reference within a claim record. */
export const claimSourceRefSchema = z
  .object({
    sourceId: z.string().min(1),
    url: z.string().url(),
    title: z.string().min(1),
    retrievedAt: isoDate,
  })
  .strict();

export type ClaimSourceRef = z.infer<typeof claimSourceRefSchema>;

/** A calculation input reference within a claim record (for `calculation` type). */
export const calculationInputSchema = z
  .object({
    ref: z.string().min(1),
    value: z.string(),
  })
  .strict();

export type CalculationInput = z.infer<typeof calculationInputSchema>;

/**
 * A structured ratgeber claim record (RFC-0505). Lives at
 * `surface/claims/{lang}/{claimId}.md` as frontmatter-only content.
 */
export const claimRecordSchema = z
  .object({
    claimId: z.string().min(1),
    articleId: z.string().min(1),
    claimText: z.string(),
    claimType: z.enum(["factual", "calculation", "methodological", "regulatory"]),
    sourceRefs: z.array(claimSourceRefSchema),
    calculationInputs: z.array(calculationInputSchema).optional().default([]),
    limitations: z.array(z.string()).optional().default([]),
    verifiedAt: isoDate,
    expiresAt: isoDate.optional(),
    reviewStatus: z.enum(["verified", "unverified", "disputed"]),
  })
  .strict();

export type ClaimRecord = z.infer<typeof claimRecordSchema>;
