/*
<MODULE_CONTRACT>
<purpose>Zod schema for PBP entity envelope, status, and governance (RFC-0399, RFC-0466).</purpose>
<non-goals>
  <item>Does not define entity-specific schemas — those extend this base.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpEntity envelope.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { nonEmptyString } from "./primitives.js";

export const pbpEntityStatusSchema = z.enum([
  "draft",
  "published",
  "suspended",
  "retired",
  "superseded",
]);

export const pbpGovernanceSchema = z.object({
  authorityRef: nonEmptyString,
  effectiveFrom: nonEmptyString.optional(),
  reviewedAt: nonEmptyString.optional(),
  reviewEvery: nonEmptyString.optional(),
  maintenanceOwnerRef: nonEmptyString.optional(),
});

// ADR-025: entity IDs must not contain locale markers
const entityIdSchema = nonEmptyString.refine(
  (s) => !/(?:^|[\/\-_.])(de|en|uk|fr|es|it|nl|pl|ru)(?:[\/\-_.]|$)/.test(s.toLowerCase()),
  { message: "Entity IDs must not contain locale markers (ADR-025)" },
);

// RFC-0399: schema ID pattern pbp/{entity}@{major}
const schemaIdSchema = nonEmptyString.refine((s) => /^pbp\/[a-z][a-z0-9-]*@\d+$/.test(s), {
  message: "Schema ID must match pattern: pbp/{entity}@{major} (RFC-0399)",
});

export const pbpEntitySchema = z.object({
  schema: schemaIdSchema,
  id: entityIdSchema,
  type: nonEmptyString,
  status: pbpEntityStatusSchema,
  name: nonEmptyString.optional(),
  summary: nonEmptyString.optional(),
  governance: pbpGovernanceSchema.optional(),
});

export { entityIdSchema, schemaIdSchema };
