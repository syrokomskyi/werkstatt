/*
<MODULE_CONTRACT>
<purpose>
RFC-0786: Pure projection from AgentSurfaceManifest to a DNS-AID TXT record
declaration. DNS-AID is a DNS-based agent discovery mechanism: a TXT record
at _agent.<domain> pointing to the agent.json manifest URL.
</purpose>
<non-goals>
  <item>Do not perform I/O — this is a pure function (DNA-58).</item>
  <item>Do not write to dns-records.yaml — that is the command handler's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0786: initial DNS-AID record builder — buildDnsAidRecord pure function.</item>
</CHANGE_SUMMARY>
*/

import type { AgentSurfaceManifest } from "./manifest.ts";

export interface DnsAidRecord {
  name: string;
  type: "TXT";
  content: string;
  ttl: number;
  proxied: false;
}

/**
 * Build the DNS-AID TXT record declaration from the agent surface manifest.
 * Pure function — no I/O, no side effects (DNA-58).
 *
 * The record name is `_agent.<domain>` (with leading underscore, per DNS-AID convention).
 * The content is the agent.json manifest URL.
 * TTL is 3600 seconds (1 hour).
 */
export function buildDnsAidRecord(manifest: AgentSurfaceManifest): DnsAidRecord {
  const origin = new URL(manifest.baseUrl).origin;
  const domain = new URL(manifest.baseUrl).hostname;
  return {
    name: `_agent.${domain}`,
    type: "TXT",
    content: `${origin}/.well-known/agent.json`,
    ttl: 3600,
    proxied: false,
  };
}
