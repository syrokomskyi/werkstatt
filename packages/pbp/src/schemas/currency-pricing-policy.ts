/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpCurrencyPricingPolicy entity (RFC-0736).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0736 — Zod schema for CurrencyPricingPolicy entity.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

export const pbpCurrentUsesSchema = z.object({
  presentation: z.boolean(),
  aiAnswers: z.boolean(),
  quote: z.boolean(),
  contract: z.boolean(),
  invoice: z.boolean(),
  settlement: z.boolean(),
});

export const pbpCurrencyStrategySchema = z.enum(["derived", "fixed"]);

export const pbpCurrencyTargetSchema = z.object({
  currency: nonEmptyString,
  strategy: pbpCurrencyStrategySchema,
  derivationContractRef: pbpEntityRefSchema.optional(),
  ratePolicyRef: pbpEntityRefSchema.optional(),
  currentUses: pbpCurrentUsesSchema,
});

export const pbpCurrencyPricingPolicySchema = pbpEntitySchema
  .extend({
    type: z.literal("currency-pricing-policy"),
    businessRef: pbpEntityRefSchema,
    baseCurrency: nonEmptyString,
    targetCurrencies: z
      .record(z.string(), pbpCurrencyTargetSchema)
      .refine((val) => Object.keys(val).length >= 1, {
        message: "targetCurrencies must have at least one entry",
      }),
  })
  .strict();
