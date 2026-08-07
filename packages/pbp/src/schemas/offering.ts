/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpOffering entity (RFC-0429, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpOffering.</item>
  <item>RFC-0482 — added optional `presentation` field for legacy business data migration.</item>
  <item>RFC-0728 — enforce `pbpChargeSchema` on `pricing.charges` (replaced `z.unknown()`).</item>
  <item>RFC-0730 — removed `presentation` field entirely; added `guarantees` field; extended `pbpRelatedOfferingSchema` with `label`/`description` display fields.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";
import { pbpChargeSchema, pbpExternalCostSchema } from "./pricing.js";

const pbpAvailabilityModeSchema = z.enum(["declared", "on-request", "unavailable"]);
const pbpOfferingRelationSchema = z.enum([
  "optional",
  "requires",
  "incompatibleWith",
  "alternativeTo",
  "included",
]);
const pbpOfferingAcquisitionSchema = z.enum(["standalone", "with-this-offering", "either"]);

const pbpAllowanceSchema = z.object({
  subjectRef: nonEmptyString,
  includedQuantity: z.object({ value: nonEmptyString, unitRef: nonEmptyString }).optional(),
  resetPeriod: nonEmptyString.optional(),
  overageChargeRef: nonEmptyString.optional(),
});

const pbpGuaranteeItemSchema = z.object({
  label: nonEmptyString,
  detail: nonEmptyString,
});

const pbpRelatedOfferingSchema = z.object({
  relation: pbpOfferingRelationSchema,
  offeringRef: pbpEntityRefSchema,
  acquisition: pbpOfferingAcquisitionSchema.optional(),
  label: nonEmptyString.optional(),
  description: nonEmptyString.optional(),
});

const pbpPricingSchema = z.object({
  currency: nonEmptyString,
  tax: z.record(z.string(), z.unknown()).optional(),
  charges: z.record(z.string(), pbpChargeSchema).optional(),
  externalCosts: z.record(z.string(), pbpExternalCostSchema).optional(),
  plans: z.record(z.string(), z.unknown()).optional(),
  adjustments: z.record(z.string(), z.unknown()).optional(),
});

export const offeringSchema = pbpEntitySchema
  .extend({
    type: z.literal("offering"),
    name: nonEmptyString,
    summary: nonEmptyString.optional(),
    businessRef: pbpEntityRefSchema,
    catalogEntryRef: pbpEntityRefSchema.optional(),
    audience: z
      .object({
        buyerTypes: z.record(z.string(), z.object({ valueRef: nonEmptyString })).optional(),
        segments: z.record(z.string(), z.object({ valueRef: nonEmptyString })).optional(),
      })
      .optional(),
    availability: z
      .object({
        mode: pbpAvailabilityModeSchema,
        territories: z.record(z.string(), z.object({ countryCode: nonEmptyString })).optional(),
      })
      .optional(),
    package: z
      .object({
        included: z
          .record(
            z.string(),
            z.object({
              itemRef: pbpEntityRefSchema,
              inclusion: nonEmptyString,
            }),
          )
          .optional(),
        allowances: z.record(z.string(), pbpAllowanceSchema).optional(),
      })
      .optional(),
    pricing: pbpPricingSchema.optional(),
    acquisition: z
      .object({
        channelRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
      })
      .optional(),
    fulfillment: z.record(z.string(), z.unknown()).optional(),
    customerResponsibilities: z.record(z.string(), z.unknown()).optional(),
    terms: z.record(z.string(), z.unknown()).optional(),
    policyRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
    relatedOfferings: z.record(z.string(), pbpRelatedOfferingSchema).optional(),
    limitations: z.record(z.string(), z.unknown()).optional(),
    guarantees: z.record(z.string(), pbpGuaranteeItemSchema).optional(),
  })
  .strict();
