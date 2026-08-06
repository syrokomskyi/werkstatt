/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpEvidenceSource entity (RFC-0416, RFC-0466, RFC-0706).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpEvidenceSource.</item>
  <item>RFC-0706 — Added 4 Nachweisregister evidence kind values, optional file-based evidence fields in items, made url/retrievedAt optional.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpEvidenceKindSchema = z.enum([
  "external-web-sources",
  "verified-record",
  "third-party-registry",
  // RFC-0706: Nachweisregister evidence types
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
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
          // RFC-0706: url and retrievedAt are optional for private file-based evidence
          url: nonEmptyString.optional(),
          retrievedAt: nonEmptyString.optional(),
          // RFC-0706: file-based evidence fields
          sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          storage: z.enum(["private", "public"]).optional(),
          mediaType: nonEmptyString.optional(),
          qualityStatus: z
            .enum(["unverified", "verified", "verified_with_quality_issue", "changed", "rejected"])
            .optional(),
        }),
      )
      .optional(),
  })
  .strict();
