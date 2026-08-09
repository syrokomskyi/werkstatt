/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpServiceLevelPolicy (RFC-0447, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpServiceLevelPolicy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { policySchema } from "./policy.js";
import { nonEmptyString } from "./primitives.js";

const pbpSlaOperatorSchema = z.enum(["greater-than-or-equal", "less-than-or-equal", "equals"]);

const pbpSlaObjectiveSchema = z.object({
  metricRef: nonEmptyString,
  operator: pbpSlaOperatorSchema,
  threshold: z.object({ value: nonEmptyString, unitRef: nonEmptyString }),
  measurementWindow: nonEmptyString,
});

const pbpSlaRemedySchema = z.object({
  trigger: z.literal("objective-not-met"),
  type: z.enum(["service-credit", "continued-performance"]),
  value: z.object({ model: nonEmptyString, periods: z.number().optional() }).optional(),
  application: z.enum(["automatic", "on-request"]),
});

export const slaPolicySchema = policySchema
  .extend({
    kind: z.literal("service-level"),
    objective: pbpSlaObjectiveSchema,
    measurement: z
      .object({ methodRef: nonEmptyString, evidenceSourceRef: nonEmptyString })
      .optional(),
    exclusions: z.record(z.string(), z.object({ reasonRef: nonEmptyString })).optional(),
    remedy: pbpSlaRemedySchema.optional(),
  })
  .strict();
