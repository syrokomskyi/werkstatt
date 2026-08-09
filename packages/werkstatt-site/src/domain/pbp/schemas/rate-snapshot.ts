/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpRateSnapshot entity (RFC-0738).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0738 — Zod schema for RateSnapshot entity with digest and source validation.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, decimalString } from "./primitives.js";
import { pbpRateModeSchema, pbpRateDirectionSchema } from "./rate-policy.js";

export const pbpRateSnapshotDigestSchema = z.object({
  algorithm: nonEmptyString,
  value: nonEmptyString,
});

export const pbpRateSnapshotSourceSchema = z.object({
  kind: pbpRateModeSchema,
  sourceContractRef: pbpEntityRefSchema.optional(),
  rateScheduleRef: pbpEntityRefSchema.optional(),
  rateScheduleEntryKey: nonEmptyString.optional(),
});

export const rateSnapshotSchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-snapshot"),
    pair: z.object({
      sourceCurrency: nonEmptyString,
      targetCurrency: nonEmptyString,
    }),
    quotation: z.object({
      direction: pbpRateDirectionSchema,
    }),
    value: decimalString,
    source: pbpRateSnapshotSourceSchema,
    observedAt: nonEmptyString,
    freshUntil: nonEmptyString,
    digest: pbpRateSnapshotDigestSchema,
  })
  .strict();
