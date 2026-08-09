/*
<MODULE_CONTRACT>
<purpose>Zod schemas for PbpCatalog and PbpCatalogEntry entities (RFC-0427, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schemas for PbpCatalog and PbpCatalogEntry.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

export const catalogSchema = pbpEntitySchema
  .extend({
    type: z.literal("catalog"),
    name: nonEmptyString,
    businessRef: pbpEntityRefSchema,
    entrySource: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("manifest-directory"), logicalPath: nonEmptyString }),
      z.object({ mode: z.literal("dataset"), adapterRef: nonEmptyString }),
    ]),
  })
  .strict();

export const catalogEntrySchema = pbpEntitySchema
  .extend({
    type: z.literal("catalog-entry"),
    name: nonEmptyString,
    summary: nonEmptyString.optional(),
    catalogRef: pbpEntityRefSchema,
    itemRef: pbpEntityRefSchema,
    localIdentifiers: z.record(z.string(), nonEmptyString).optional(),
    merchandising: z
      .object({
        featured: z.boolean().optional(),
        displayOrder: z.number().optional(),
      })
      .optional(),
    offeringRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
  })
  .strict();
