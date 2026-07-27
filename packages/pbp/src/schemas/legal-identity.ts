/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpLegalIdentity entity (RFC-0409, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpLegalIdentity.</item>
  <item>RFC-0482 — added optional `presentation` field for legacy business data migration.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, pbpExternalIdentifierSchema } from "./primitives.js";

const pbpSemanticStatusSchema = z.enum([
  "declared",
  "derived",
  "not-declared",
  "not-applicable",
  "unavailable",
  "invalid",
  "stale",
  "not-comparable",
]);

export const legalIdentitySchema = pbpEntitySchema
  .extend({
    type: z.literal("legal-identity"),
    legalName: nonEmptyString,
    legalForm: z.object({ valueRef: nonEmptyString }).optional(),
    responsiblePerson: z.object({ name: nonEmptyString }).optional(),
    registeredPlaceRef: pbpEntityRefSchema.optional(),
    publicIdentifiers: z
      .record(
        z.string(),
        z.object({
          status: pbpSemanticStatusSchema,
          value: nonEmptyString.optional(),
        }),
      )
      .optional(),
    publicRegistrations: z.record(z.string(), pbpEntityRefSchema).optional(),
    externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),
    presentation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
