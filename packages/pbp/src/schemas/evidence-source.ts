/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpEvidenceSource entity (RFC-0416, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpEvidenceSource.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpEvidenceKindSchema = z.enum([
  "external-web-sources",
  "verified-record",
  "third-party-registry",
]);

export const evidenceSourceSchema = pbpEntitySchema
  .extend({
    type: z.literal("evidence-source"),
    name: nonEmptyString,
    kind: pbpEvidenceKindSchema,
    authority: z.object({ kind: nonEmptyString }),
    items: z
      .record(
        z.string(),
        z.object({
          url: nonEmptyString,
          retrievedAt: nonEmptyString,
        }),
      )
      .optional(),
  })
  .strict();
