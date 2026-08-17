/*
<MODULE_CONTRACT>
<purpose>
RFC-0753: Zod schema for DNS record declaration files (systems-cache/<id>/dns-records.yaml).
Defines the canonical structure for version-controlled DNS record declarations
that are synced to Cloudflare via the dns.record.* command family.
</purpose>
<non-goals>
  <item>Do not define Cloudflare API response shapes — those live in the API client.</item>
  <item>Do not include private key material — only public TXT values are declared.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0753: initial DNS record declaration schema — dnsRecordTypeSchema, dnsRecordDeclarationSchema, dnsRecordFileSchema.</item>
  <item>RFC-0786: add ttl?: number field to dnsRecordDeclarationSchema for DNS-AID records.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const dnsRecordTypeSchema = z.enum([
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "SRV",
  "CAA",
  "SVCB",
  "HTTPS",
]);

export const dnsRecordDeclarationSchema = z.object({
  name: z.string().min(1),
  type: dnsRecordTypeSchema,
  content: z.string(),
  priority: z.number().int().min(0).max(65535).optional(),
  proxied: z.boolean().optional().default(false),
  ttl: z.number().int().min(1).max(86400).optional(),
  comment: z.string().optional(),
});

export const dnsRecordFileSchema = z.object({
  kind: z.literal("dns-records"),
  schemaVersion: z.literal(1),
  zone: z.string().min(1),
  updatedAt: z.string(),
  records: z.array(dnsRecordDeclarationSchema),
});

export type DnsRecordType = z.infer<typeof dnsRecordTypeSchema>;
export type DnsRecordDeclaration = z.infer<typeof dnsRecordDeclarationSchema>;
export type DnsRecordFile = z.infer<typeof dnsRecordFileSchema>;
