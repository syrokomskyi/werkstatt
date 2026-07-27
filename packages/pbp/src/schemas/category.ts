/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpCategory entity (RFC-0414, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpCategory.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

export const categorySchema = pbpEntitySchema
  .extend({
    type: z.literal("category"),
    name: nonEmptyString,
    broaderRef: pbpEntityRefSchema.optional(),
    externalMappings: z.record(z.string(), z.object({ value: nonEmptyString })).optional(),
  })
  .strict();
