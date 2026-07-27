/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpPublicDocument entity (RFC-0420, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpPublicDocument.</item>
  <item>RFC-0482 — added optional `presentation` field for legacy business data migration.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema, pbpGovernanceSchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpDocumentKindSchema = z.enum([
  "terms-and-conditions",
  "privacy-policy",
  "imprint",
  "legal-notice",
]);

export const publicDocumentSchema = pbpEntitySchema
  .extend({
    type: z.literal("public-document"),
    kind: pbpDocumentKindSchema,
    name: nonEmptyString,
    canonicalUrl: nonEmptyString,
    governance: pbpGovernanceSchema,
    presentation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
