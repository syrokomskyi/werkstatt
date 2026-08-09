/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpPlace entity (RFC-0411, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpPlace.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpPlaceKindSchema = z.enum(["locality", "region", "country"]);

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

export const placeSchema = pbpEntitySchema
  .extend({
    type: z.literal("place"),
    name: nonEmptyString,
    kind: pbpPlaceKindSchema,
    address: z
      .object({
        street: nonEmptyString.optional(),
        streetNumber: nonEmptyString.optional(),
        postalCode: nonEmptyString.optional(),
        locality: nonEmptyString.optional(),
        administrativeArea: nonEmptyString.optional(),
        countryCode: nonEmptyString,
      })
      .optional(),
    geo: z
      .object({
        status: pbpSemanticStatusSchema,
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
      .optional(),
    publicUrl: nonEmptyString.optional(),
  })
  .strict();
