/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpContactPoint entity (RFC-0412, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpContactPoint.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpContactChannelSchema = z.enum(["email", "phone", "form", "chat", "postal"]);

export const contactPointSchema = pbpEntitySchema
  .extend({
    type: z.literal("contact-point"),
    name: nonEmptyString,
    channel: pbpContactChannelSchema,
    value: nonEmptyString,
    purposes: z.record(z.string(), z.object({ valueRef: nonEmptyString })).optional(),
    preferred: z.boolean().optional(),
    languages: z.record(z.string(), nonEmptyString).optional(),
  })
  .strict();
