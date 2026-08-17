/*
<MODULE_CONTRACT>
<purpose>
  RFC-0786: Pure projection from AgentSurfaceManifest to DNS-AID SVCB record
  declaration. DNS-AID is a DNS-based agent discovery mechanism: an SVCB record
  at _index._agents.<domain> with target pointing to the host serving
  agent.json, and standard SvcParams (alpn, port) per RFC 9460.
</purpose>
<non-goals>
  <item>Do not perform I/O — this is a pure function (DNA-58).</item>
  <item>Do not write to dns-records.yaml — that is the command handler's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0786: initial DNS-AID record builder — TXT record at _agent.<domain>.</item>
  <item>RFC-0786: updated to SVCB record at _index._agents.<domain> per DNS-AID spec.</item>
</CHANGE_SUMMARY>
*/

import type { AgentSurfaceManifest } from "./manifest.ts";

export interface DnsAidRecord {
  name: string;
  type: "SVCB";
  content: string;
  ttl: number;
  proxied: false;
}

/**
 * Build the DNS-AID SVCB record declaration from the agent surface manifest.
 * Pure function — no I/O, no side effects (DNA-58).
 *
 * The record name is `_index._agents.<domain>` (per DNS-AID spec).
 * The record is an SVCB service record (RFC 9460) with:
 *   priority: 1 (service mode)
 *   target: <domain> (the host serving agent.json)
 *   alpn: h2 (HTTP/2)
 *   port: 443 (HTTPS)
 * The client resolves the target host, connects via alpn/port, and fetches
 * /.well-known/agent.json — the path is implied by the DNS-AID spec.
 * TTL is 3600 seconds (1 hour).
 */
export function buildDnsAidRecord(manifest: AgentSurfaceManifest): DnsAidRecord {
  const domain = new URL(manifest.baseUrl).hostname;
  return {
    name: `_index._agents.${domain}`,
    type: "SVCB",
    content: `1 ${domain} alpn=h2 port=443`,
    ttl: 3600,
    proxied: false,
  };
}
