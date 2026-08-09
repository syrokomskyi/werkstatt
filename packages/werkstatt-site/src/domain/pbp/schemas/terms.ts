/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpTerms (RFC-0438, RFC-0466).
Embedded in offering schema — not exported individually from ./schemas barrel.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpTerms.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

const pbpRenewalModeSchema = z.enum(["automatic", "manual", "none"]);

export const pbpTermsSchema = z.object({
  minimumTerm: nonEmptyString.optional(),
  renewal: z
    .object({
      mode: pbpRenewalModeSchema,
      period: nonEmptyString,
    })
    .optional(),
  cancellation: z.object({ policyRef: pbpEntityRefSchema }).optional(),
  priceChanges: z.object({ policyRef: pbpEntityRefSchema }).optional(),
});
