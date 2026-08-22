/*
<MODULE_CONTRACT>
<purpose>Verification block schema (RFC-0909) for the system manifest.
Declares per-search-engine verification method and token for Google Search Console.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0909: initial verification schema for search engine verification surface.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * The `verification:` block in src/content/system.md. Declares per-search-engine
 * verification method and token so that search.verification.validate can enforce
 * the declaration and the layout can emit the google-site-verification meta tag.
 *
 * Example src/content/system.md verification block:
 *   verification:
 *     google:
 *       method: dns-txt
 *       token: google-site-verification=abc123...
 */
export const systemVerificationSchema = z.object({
  google: z
    .object({
      method: z.enum(["dns-txt", "meta-tag"]),
      /**
       * dns-txt: full TXT value "google-site-verification=...".
       * meta-tag: content attribute of the google-site-verification meta tag.
       */
      token: z.string().min(1),
    })
    .optional(),
});

export type SystemVerification = z.infer<typeof systemVerificationSchema>;
