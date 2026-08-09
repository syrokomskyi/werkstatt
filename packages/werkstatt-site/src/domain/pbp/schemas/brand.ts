/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpBrand entity (RFC-0410, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpBrand.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, pbpExternalIdentifierSchema } from "./primitives.js";

export const brandSchema = pbpEntitySchema
  .extend({
    type: z.literal("brand"),
    name: nonEmptyString,
    tagline: nonEmptyString.optional(),
    ownerBusinessRef: pbpEntityRefSchema,
    externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),
  })
  .strict();
