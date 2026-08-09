/*
<MODULE_CONTRACT>
<purpose>Zod schemas for PBP primitive value types (RFC-0400, RFC-0466).</purpose>
<non-goals>
  <item>Does not define entity schemas — those are in separate files per entity.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schemas for all PBP primitive types.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

// ADR-038: no empty strings in canonical fields
// ADR-037: no HTML in canonical string fields
const nonEmptyString = z
  .string()
  .min(1)
  .refine((s) => !/<[a-z][\s\S]*>/i.test(s), {
    message: "HTML tags are not allowed in canonical fields (ADR-037)",
  });
// Alias for clarity at call sites where HTML check is the primary concern
const noHtmlString = nonEmptyString;

// ADR-012: money value is a decimal string, not a number
const decimalString = nonEmptyString.refine((s) => /^\d+(\.\d+)?$/.test(s), {
  message: 'Money value must be a decimal string like "70.00" (ADR-012)',
});

export const pbpLocalizedStringSchema = z.object({
  value: nonEmptyString,
  language: nonEmptyString,
});

export const pbpMoneySchema = z.object({
  value: decimalString,
  currency: nonEmptyString,
});

export const pbpMoneyRangeSchema = z.object({
  minimum: pbpMoneySchema,
  maximum: pbpMoneySchema,
});

export const pbpIsoDurationSchema = nonEmptyString;

export const pbpQuantitativeDurationSchema = z.object({
  value: z.number(),
  unitRef: nonEmptyString,
});

export const pbpTimestampSchema = nonEmptyString;

export const pbpQuantitativeValueSchema = z.object({
  value: nonEmptyString.optional(),
  minimum: nonEmptyString.optional(),
  maximum: nonEmptyString.optional(),
  unitRef: nonEmptyString,
});

export const pbpExternalIdentifierSchema = z.object({
  schemeRef: nonEmptyString,
  value: nonEmptyString,
  authorityRef: nonEmptyString.optional(),
});

export const pbpControlledValueSchema = z.object({
  valueRef: nonEmptyString,
});

export { noHtmlString, nonEmptyString, decimalString };
