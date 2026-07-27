/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpDisclosure entity (RFC-0417, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpDisclosure.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

const pbpDisclosureKindSchema = z.enum([
  "technology-dependency",
  "data-processing",
  "ownership-change",
  "regulatory",
]);

const pbpDisclosureMaterialitySchema = z.enum(["informative", "material", "critical"]);

export const disclosureSchema = pbpEntitySchema
  .extend({
    type: z.literal("disclosure"),
    kind: pbpDisclosureKindSchema,
    name: nonEmptyString,
    statement: nonEmptyString,
    scope: z
      .object({
        offeringRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
      })
      .optional(),
    relatedPartyRef: pbpEntityRefSchema.optional(),
    materiality: pbpDisclosureMaterialitySchema,
    publication: z.object({ required: z.boolean() }),
  })
  .strict();
