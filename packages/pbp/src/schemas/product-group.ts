/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpProductGroup entity (RFC-0415, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpProductGroup.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

export const productGroupSchema = pbpEntitySchema
  .extend({
    type: z.literal("product-group"),
    name: nonEmptyString,
    classification: z
      .object({
        categoryRef: pbpEntityRefSchema.optional(),
      })
      .optional(),
    variationAxes: z.record(
      z.string(),
      z.object({
        attributeRef: nonEmptyString,
        required: z.boolean(),
      }),
    ),
  })
  .strict();
