/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpConsent entity (RFC-0706, RFC-0466, ADR-0028).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0706 — Zod schema for PbpConsent (Nachweisregister consent management).</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpConsentMethodSchema = z.enum(["verified_business_email", "signed_pdf", "qes", "none"]);

const pbpConsentStatusSchema = z.enum([
  "not_requested",
  "requested",
  "partially_granted",
  "granted",
  "revoked",
  "expired",
]);

export const consentSchema = pbpEntitySchema
  .extend({
    type: z.literal("consent"),
    name: nonEmptyString,
    textVersion: nonEmptyString,
    purposes: z.array(nonEmptyString),
    channels: z.array(nonEmptyString),
    dataElements: z.array(nonEmptyString),
    method: pbpConsentMethodSchema,
    grantedAt: z.union([z.string(), z.null()]),
    evidenceRef: z.union([z.string(), z.null()]),
    consentStatus: pbpConsentStatusSchema,
    withdrawalContact: nonEmptyString.optional(),
  })
  .refine(
    (data) => !(data.consentStatus === "granted" && data.grantedAt === null),
    "granted consent must record when it was granted (grantedAt must not be null when consentStatus is 'granted')",
  )
  .strict();
