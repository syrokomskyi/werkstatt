/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpClaim entity (RFC-0405, RFC-0466, RFC-0706).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpClaim.</item>
  <item>RFC-0706 — Added optional statementLang field.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema, pbpGovernanceSchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

const pbpClaimClassSchema = z.enum([
  "comparative-commercial",
  "comparative-technical",
  "factual",
  "risk",
  "benefit",
  "limitation",
]);

const pbpClaimKindSchema = z.enum([
  "risk",
  "benefit",
  "comparison",
  "fact",
  "limitation",
  "recommendation",
]);

export const claimSchema = pbpEntitySchema
  .extend({
    type: z.literal("claim"),
    claimClass: pbpClaimClassSchema,
    claimKind: pbpClaimKindSchema,
    subject: z.object({
      kind: nonEmptyString,
      name: nonEmptyString,
    }),
    statement: nonEmptyString,
    evidenceRefs: z.record(z.string(), pbpEntityRefSchema).optional(),
    governance: pbpGovernanceSchema,
    publication: z
      .object({
        staleBehavior: z.enum(["block", "warn", "omit"]),
        showAsOfDate: z.boolean(),
        showEvidenceLabel: z.boolean(),
      })
      .optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    statementLang: nonEmptyString.optional(),
  })
  .strict();
