/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpExitPolicy (RFC-0450, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpExitPolicy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { policySchema } from "./policy.js";
import { nonEmptyString } from "./primitives.js";

const pbpExitPackageSchema = z.object({
  domain: z.object({ included: z.boolean() }).optional(),
  customerContent: z.object({ included: z.boolean() }).optional(),
  builtWebsite: z.object({ included: z.boolean() }).optional(),
});

export const exitPolicySchema = policySchema
  .extend({
    kind: z.literal("exit"),
    trigger: z.object({ event: nonEmptyString }),
    deliveryTarget: z.object({ duration: nonEmptyString }),
    package: pbpExitPackageSchema,
    formats: z
      .object({
        deployableFiles: z.object({ valueRef: nonEmptyString }).optional(),
      })
      .optional(),
  })
  .strict();
