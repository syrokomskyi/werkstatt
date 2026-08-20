/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpConsent entity (RFC-0706, RFC-0466, RFC-0885, ADR-0028).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0706 — Zod schema for PbpConsent (Nachweisregister consent management).</item>
  <item>RFC-0885 — Replaced consentStatus/grantedAt/method with consentScope (per-aspect granular consent).</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpConsentMethodSchema = z.enum(["verified_business_email", "signed_pdf", "qes", "none"]);

// RFC-0885: per-aspect consent scope status
const pbpConsentScopeStatusSchema = z.enum(["not_requested", "granted", "denied"]);

// RFC-0885: per-aspect consent scope entry
const pbpConsentScopeEntrySchema = z.object({
  status: pbpConsentScopeStatusSchema,
  grantedAt: z.union([z.string(), z.null()]),
  method: pbpConsentMethodSchema,
});

// RFC-0885: granular consent scope for document, screenshot, websiteLink aspects
const pbpConsentScopeSchema = z.object({
  document: pbpConsentScopeEntrySchema,
  screenshot: pbpConsentScopeEntrySchema,
  websiteLink: pbpConsentScopeEntrySchema,
});

export const consentSchema = pbpEntitySchema
  .extend({
    type: z.literal("consent"),
    name: nonEmptyString,
    textVersion: nonEmptyString,
    purposes: z.array(nonEmptyString),
    channels: z.array(nonEmptyString),
    dataElements: z.array(nonEmptyString),
    evidenceRef: z.union([z.string(), z.null()]),
    withdrawalContact: nonEmptyString.optional(),
    // RFC-0885: granular per-aspect consent scope (replaces consentStatus/grantedAt/method)
    consentScope: pbpConsentScopeSchema,
  })
  .refine((data) => {
    const aspects = [
      data.consentScope.document,
      data.consentScope.screenshot,
      data.consentScope.websiteLink,
    ];
    return aspects.every((entry) => !(entry.status === "granted" && entry.grantedAt === null));
  }, "granted consent scope entry must record when it was granted (grantedAt must not be null when status is 'granted')")
  .strict();
