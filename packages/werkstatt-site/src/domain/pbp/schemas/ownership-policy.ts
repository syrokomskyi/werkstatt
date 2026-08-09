/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpOwnershipPolicy (RFC-0449, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpOwnershipPolicy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { policySchema } from "./policy.js";
import { nonEmptyString } from "./primitives.js";

const pbpAssetHolderSchema = z.enum(["customer", "third-party", "provider"]);

const pbpOwnershipAssetSchema = z.object({
  holder: pbpAssetHolderSchema,
  timing: nonEmptyString.optional(),
  usageBasis: nonEmptyString.optional(),
});

export const ownershipPolicySchema = policySchema
  .extend({
    kind: z.literal("ownership"),
    assets: z.object({
      domain: pbpOwnershipAssetSchema.optional(),
      customerContent: pbpOwnershipAssetSchema.optional(),
      builtWebsite: pbpOwnershipAssetSchema.optional(),
      sourceCode: pbpOwnershipAssetSchema.optional(),
      thirdPartyComponents: pbpOwnershipAssetSchema.optional(),
    }),
  })
  .strict();
