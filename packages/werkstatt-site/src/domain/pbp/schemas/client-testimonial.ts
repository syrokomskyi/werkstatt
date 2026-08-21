/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpClientTestimonial entity (RFC-0900).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0900 — Zod schema for PbpClientTestimonial (client gratitude display).</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

export const clientTestimonialSchema = pbpEntitySchema
  .extend({
    type: z.literal("client-testimonial"),
    name: nonEmptyString,
    quote: nonEmptyString,
    authorName: nonEmptyString,
    authorRole: nonEmptyString.optional(),
    authorOrganization: nonEmptyString.optional(),
    evidenceRef: nonEmptyString.optional(),
  })
  .strict();
