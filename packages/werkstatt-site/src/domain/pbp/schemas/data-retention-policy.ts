/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpDataRetentionPolicy (RFC-0452, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpDataRetentionPolicy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { policySchema } from "./policy.js";
import { nonEmptyString } from "./primitives.js";

const pbpRetentionPeriodSchema = z.object({
  duration: nonEmptyString,
  startsFrom: nonEmptyString,
});

export const dataRetentionPolicySchema = policySchema
  .extend({
    kind: z.literal("data-retention"),
    retention: z.record(z.string(), pbpRetentionPeriodSchema),
    deletion: z.object({ method: nonEmptyString, timeline: nonEmptyString }),
  })
  .strict();
