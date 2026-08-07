/*
<MODULE_CONTRACT>
<purpose>Zod schemas for PBP pricing types: Charge, Plan, Adjustment (RFC-0437, RFC-0466).
Embedded in offering schema — not exported individually from ./schemas barrel.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schemas for PBP pricing types.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, decimalString } from "./primitives.js";

const pbpChargeTypeSchema = z.enum(["one-time", "recurring", "usage", "deposit"]);
const pbpAmountModelSchema = z.enum(["fixed", "range", "tiered", "unit-rate"]);

const pbpChargeAmountSchema = z.discriminatedUnion("model", [
  z.object({ model: z.literal("fixed"), value: decimalString }),
  z.object({ model: z.literal("range"), minimum: decimalString, maximum: decimalString }),
  z.object({ model: z.literal("unit-rate"), unitValue: decimalString }),
  z.object({
    model: z.literal("tiered"),
    method: z.enum(["graduated", "volume"]),
    tiers: z.record(
      z.string(),
      z.object({
        order: z.number(),
        upTo: nonEmptyString.optional(),
        above: nonEmptyString.optional(),
        unitValue: decimalString,
      }),
    ),
  }),
]);

export const pbpChargeSchema = z.object({
  type: pbpChargeTypeSchema,
  purpose: nonEmptyString,
  amount: pbpChargeAmountSchema,
  trigger: z.object({ event: nonEmptyString }).optional(),
  recurrence: nonEmptyString.optional(),
  basis: z.object({ metricRef: nonEmptyString, unitRef: nonEmptyString }).optional(),
  refundPolicyRef: pbpEntityRefSchema.optional(),
  determination: z.object({ method: nonEmptyString, beforePurchase: z.boolean() }).optional(),
});

export const pbpPlanSchema = z.object({
  name: nonEmptyString,
  chargeRefs: z.record(z.string(), z.object({ ref: nonEmptyString })),
  billing: z.object({ recurrence: nonEmptyString, billingDay: z.number().optional() }),
  terms: z
    .object({
      minimumTerm: nonEmptyString.optional(),
      renewal: z.object({ mode: nonEmptyString, period: nonEmptyString }).optional(),
    })
    .optional(),
});

const pbpAdjustmentTypeSchema = z.enum(["discount", "surcharge", "waiver"]);

export const pbpAdjustmentSchema = z.object({
  type: pbpAdjustmentTypeSchema,
  calculation: z.object({
    model: z.enum(["fixed", "percentage"]),
    value: nonEmptyString,
  }),
  appliesWhen: z.object({ planRef: nonEmptyString.optional() }).optional(),
  appliesTo: z
    .object({ chargeRefs: z.record(z.string(), z.object({ ref: nonEmptyString })) })
    .optional(),
});

const pbpExternalCostAmountSchema = z.discriminatedUnion("model", [
  z.object({ model: z.literal("fixed"), value: decimalString }),
  z.object({ model: z.literal("cap"), value: decimalString }),
  z.object({ model: z.literal("range"), minimum: decimalString, maximum: decimalString }),
]);

export const pbpExternalCostSchema = z.object({
  purpose: nonEmptyString,
  amount: pbpExternalCostAmountSchema,
  paidBy: z.enum(["provider", "client"]),
  recurrence: nonEmptyString.optional(),
  note: nonEmptyString.optional(),
});
