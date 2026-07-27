/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpProductVariant entity (RFC-0415, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpProductVariant.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString, pbpExternalIdentifierSchema } from "./primitives.js";

export const productVariantSchema = pbpEntitySchema
  .extend({
    type: z.literal("product-variant"),
    name: nonEmptyString,
    groupRef: pbpEntityRefSchema,
    variantValues: z.record(z.string(), z.object({ valueRef: nonEmptyString })),
    externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),
  })
  .strict();
