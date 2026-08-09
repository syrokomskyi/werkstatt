/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpBusiness entity (RFC-0403, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpBusiness.</item>
  <item>RFC-0482 — added optional `presentation` field for legacy business data migration.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, pbpExternalIdentifierSchema } from "./primitives.js";

export const businessSchema = pbpEntitySchema
  .extend({
    type: z.literal("business"),
    name: nonEmptyString,
    summary: nonEmptyString.optional(),
    description: nonEmptyString.optional(),
    businessModel: z.object({ typeRef: nonEmptyString }).optional(),
    markets: z.record(z.string(), z.object({ valueRef: nonEmptyString })).optional(),
    industries: z.record(z.string(), z.object({ categoryRef: nonEmptyString })).optional(),
    yearEstablished: z.number().int().positive().optional(),
    mission: nonEmptyString.optional(),
    brandRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
    legalIdentityRef: pbpEntityRefSchema.optional(),
    placeRefs: z
      .record(
        z.string(),
        z.object({
          ref: nonEmptyString,
          expectedType: nonEmptyString.optional(),
          role: nonEmptyString.optional(),
        }),
      )
      .optional(),
    contactPointRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
    webPresenceRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
    catalogRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
    externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),
    presentation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
