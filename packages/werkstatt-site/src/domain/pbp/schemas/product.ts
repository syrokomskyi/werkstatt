/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpProduct entity (RFC-0404, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpProduct.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, pbpExternalIdentifierSchema } from "./primitives.js";

const pbpProductKindSchema = z.enum([
  "physical-good",
  "digital-good",
  "service",
  "composite-service",
  "subscription-access",
  "license",
  "rental",
  "insurance-product",
  "bundle",
  "right",
  "data-product",
  "experience",
  "custom-made-good",
]);

export const productSchema = pbpEntitySchema
  .extend({
    type: z.literal("product"),
    kind: pbpProductKindSchema,
    name: nonEmptyString,
    summary: nonEmptyString.optional(),
    authorityRef: pbpEntityRefSchema.optional(),
    classification: z
      .object({
        categoryRef: pbpEntityRefSchema.optional(),
        comparisonProfileRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
      })
      .optional(),
    purpose: z.object({ statement: nonEmptyString }).optional(),
    outcomes: z
      .record(
        z.string(),
        z.object({ name: nonEmptyString, description: nonEmptyString.optional() }),
      )
      .optional(),
    deliverables: z
      .record(z.string(), z.object({ kind: nonEmptyString, name: nonEmptyString }))
      .optional(),
    capabilities: z
      .record(z.string(), z.object({ value: z.union([nonEmptyString, z.boolean()]) }))
      .optional(),
    externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),
    intrinsicComposition: z
      .record(
        z.string(),
        z.object({
          productRef: pbpEntityRefSchema,
          quantity: z.number().optional(),
        }),
      )
      .optional(),
  })
  .strict();
