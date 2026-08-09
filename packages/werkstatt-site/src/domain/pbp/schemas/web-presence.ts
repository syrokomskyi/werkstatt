/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpWebPresence entity (RFC-0413, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpWebPresence.</item>
  <item>RFC-0482 — added optional `presentation` field for legacy business data migration.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { pbpEntityRefSchema } from "./entity-ref.js";
import { nonEmptyString } from "./primitives.js";

const pbpWebPresenceKindSchema = z.enum(["primary-website", "landing-page", "social-profile"]);
const pbpWebControlStatusSchema = z.enum(["business-controlled", "third-party", "verified-mirror"]);

export const webPresenceSchema = pbpEntitySchema
  .extend({
    type: z.literal("web-presence"),
    name: nonEmptyString,
    kind: pbpWebPresenceKindSchema,
    canonicalUrl: nonEmptyString,
    businessRef: pbpEntityRefSchema,
    locales: z.record(z.string(), nonEmptyString).optional(),
    control: pbpWebControlStatusSchema,
    sameAs: z.array(nonEmptyString).optional(),
    presentation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
