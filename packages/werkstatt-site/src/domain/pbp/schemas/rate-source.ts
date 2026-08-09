/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpRateSource entity (RFC-0744).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — Zod schema for RateSource entity.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

export const pbpRateSourceSchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-source"),
    name: nonEmptyString,
    adapter: nonEmptyString,
    config: z.record(z.string(), z.unknown()),
  })
  .strict();
