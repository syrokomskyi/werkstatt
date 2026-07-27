/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpGuaranteePolicy (RFC-0448, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpGuaranteePolicy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { policySchema } from "./policy.js";
import { nonEmptyString } from "./primitives.js";

const pbpGuaranteeOperatorSchema = z.enum([
  "less-than-or-equal",
  "greater-than-or-equal",
  "equals",
]);

const pbpGuaranteeConditionSchema = z.object({
  trigger: z.object({ event: nonEmptyString }),
  objective: z.object({
    metricRef: nonEmptyString,
    operator: pbpGuaranteeOperatorSchema,
    threshold: z.object({ value: nonEmptyString, unitRef: nonEmptyString }),
  }),
});

const pbpGuaranteeRemedySchema = z.object({
  type: z.enum(["continued-performance", "service-credit", "refund"]),
  additionalCharge: z.boolean(),
  until: nonEmptyString,
});

export const guaranteePolicySchema = policySchema
  .extend({
    kind: z.literal("guarantee"),
    condition: pbpGuaranteeConditionSchema,
    remedy: pbpGuaranteeRemedySchema,
  })
  .strict();
