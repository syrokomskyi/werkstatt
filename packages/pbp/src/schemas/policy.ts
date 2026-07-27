/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpPolicy base entity (RFC-0439, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpPolicy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

const pbpPolicyKindSchema = z.enum([
  "service-level",
  "guarantee",
  "ownership",
  "exit",
  "data-retention",
  "cancellation",
  "price-changes",
]);

export const policySchema = pbpEntitySchema
  .extend({
    type: z.literal("policy"),
    kind: pbpPolicyKindSchema,
    name: nonEmptyString,
    scope: z
      .object({
        offeringRefs: z.record(z.string(), pbpEntityRefSchema),
      })
      .optional(),
    terms: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export { pbpPolicyKindSchema };
