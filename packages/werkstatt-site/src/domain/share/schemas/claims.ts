/*
<MODULE_CONTRACT>
<purpose>
RFC-0212: the claim annotation surface. A per-record provenance sidecar
`<record>.claims.yaml` is a map of field path → annotation, turning a bare field
into a CKL claim (RFC-0211) without touching the editable record body. Closed Zod
schema so `content.claim.validate` can shape-check every sidecar.

Moved from @warpgogol/business/schemas to @warpgogol/werkstatt-site/share/schemas as part of RFC-0470
(legacy business layer deletion). This is Content Knowledge Lifecycle (CKL)
infrastructure, not business-layer code.
</purpose>
<non-goals>
  <item>Do not resolve field paths, evaluate freshness, hash derivations, or read the filesystem — the kernel validators do that.</item>
  <item>Do not wrap or validate the record value itself; a claim only annotates.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0212: initial claim annotation + record-claims schemas.</item>
  <item>RFC-0470: moved from @warpgogol/business/schemas/claims.ts to @warpgogol/werkstatt-site/share/schemas/claims.ts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/** ISO 8601 calendar date, e.g. 2026-06-20. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO 8601 duration with at least one component, e.g. P3M, P1Y, P2W, PT12H. */
const ISO8601_DURATION = /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

const isoDate = z.string().regex(ISO_DATE, "must be an ISO 8601 date (YYYY-MM-DD)");

/**
 * One field's claim annotation (RFC-0211 claim, minus the value which stays in the
 * record body). `.strict()` so a typo'd key is caught as a schema violation
 * (CKL-CLAIM-01) instead of silently ignored.
 */
export const claimAnnotationSchema = z
  .object({
    claimClass: z
      .enum(["general", "legal", "price", "comparative-commercial"])
      .optional()
      .default("general"),
    provenance: z.enum(["external", "derived", "asserted", "generated"]),
    /** ISO date the value was last verified / asserted. */
    asOf: isoDate,
    /** ISO date after which the claim is stale. */
    validUntil: isoDate.optional(),
    /** ISO 8601 recurring review cadence, e.g. "P3M". */
    reviewEvery: z
      .string()
      .regex(ISO8601_DURATION, "must be an ISO 8601 duration (e.g. P3M)")
      .refine((v) => v !== "P" && v !== "PT", "duration must have at least one component")
      .optional(),
    /** → source descriptor id (RFC-0214) when provenance = external. */
    sourceRef: z.string().min(1).optional(),
    /** Canonical source subject string (RFC-0215) when provenance = derived. */
    derivedFrom: z.string().min(1).optional(),
    /** Normalized hash of the source value at derivation time (RFC-0215). */
    sourceHash: z.string().min(1).optional(),
    comparedEntity: z
      .object({
        name: z.string().min(1),
        kind: z.enum(["vendor", "marketplace", "platform", "competitor-category"]),
        url: z.string().url().optional(),
      })
      .optional(),
    claimKind: z
      .enum(["third-party-price", "capability", "ownership", "export", "support", "risk", "other"])
      .optional(),
    statement: z.string().min(1).optional(),
    value: z
      .object({
        amount: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        currency: z.string().min(1).optional(),
        unit: z.string().min(1).optional(),
      })
      .optional(),
    publicDisclosure: z
      .object({
        label: z.string().min(1),
        showStandDate: z.literal(true),
        showSourceLabel: z.boolean(),
      })
      .optional(),
    criticality: z.enum(["advisory", "important", "blocking"]).optional(),
    /** Responsible agent/human handle — routing (RFC-0216). */
    owner: z.string().min(1).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.claimClass !== "comparative-commercial") return;
    const required: Array<keyof typeof claim> = [
      "comparedEntity",
      "claimKind",
      "statement",
      "sourceRef",
      "reviewEvery",
      "publicDisclosure",
      "criticality",
    ];
    for (const key of required) {
      if (claim[key] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "required for comparative-commercial claims",
        });
      }
    }
    if (claim.provenance !== "external") {
      ctx.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "comparative-commercial claims must use external provenance",
      });
    }
    if (claim.criticality !== "blocking") {
      ctx.addIssue({
        code: "custom",
        path: ["criticality"],
        message: "comparative-commercial claims must be blocking",
      });
    }
    if (claim.claimKind === "third-party-price") {
      if (!claim.value?.currency)
        ctx.addIssue({
          code: "custom",
          path: ["value", "currency"],
          message: "third-party-price claims require value.currency",
        });
      if (!claim.value?.unit)
        ctx.addIssue({
          code: "custom",
          path: ["value", "unit"],
          message: "third-party-price claims require value.unit",
        });
    }
  });

export type ClaimAnnotation = z.infer<typeof claimAnnotationSchema>;

/** The full `<record>.claims.yaml` sidecar: fieldPath → annotation. */
export const recordClaimsSchema = z.record(z.string().min(1), claimAnnotationSchema);

export type RecordClaims = z.infer<typeof recordClaimsSchema>;
