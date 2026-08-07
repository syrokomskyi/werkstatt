/*
<MODULE_CONTRACT>
<purpose>Zod schemas for PbpRatePolicy and PbpRateSchedule entities (RFC-0737).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0737 — Zod schemas for RatePolicy and RateSchedule entities.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, decimalString } from "./primitives.js";

export const pbpRateModeSchema = z.enum(["external", "business-fixed"]);

export const pbpRateDirectionSchema = z.enum(["target-per-source", "source-per-target"]);

export const pbpCurrencyPairSchema = z.object({
  sourceCurrency: nonEmptyString,
  targetCurrency: nonEmptyString,
});

export const pbpQuotationSchema = z.object({
  direction: pbpRateDirectionSchema,
});

export const pbpRatePolicySchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-policy"),
    pair: pbpCurrencyPairSchema,
    quotation: pbpQuotationSchema,
    mode: pbpRateModeSchema,
    sources: z
      .object({
        primary: pbpEntityRefSchema,
        fallback: pbpEntityRefSchema.optional(),
      })
      .optional(),
    freshness: z.object({
      maximumAge: nonEmptyString,
      allowLastKnownValue: z.boolean(),
    }),
    failure: z.object({
      noAcceptableRate: z.enum(["source-price-only", "block-publication"]),
    }),
  })
  .strict();

export const pbpRateScheduleEntrySchema = z.object({
  value: decimalString,
  validFrom: nonEmptyString,
});

export const pbpRateScheduleSchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-schedule"),
    pair: pbpCurrencyPairSchema,
    quotation: pbpQuotationSchema,
    entries: z
      .record(z.string(), pbpRateScheduleEntrySchema)
      .refine((val) => Object.keys(val).length >= 1, {
        message: "entries must have at least one entry",
      }),
  })
  .strict();
