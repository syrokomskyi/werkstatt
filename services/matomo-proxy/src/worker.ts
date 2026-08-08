/*
<MODULE_CONTRACT>
<purpose>Expose the Cloudflare Worker fetch entrypoint for the RFC-0305 first-party Matomo proxy.</purpose>
<non-goals>
  <item>Do not own reusable proxy rules, app config, provisioning, reporting, or export logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add first-party Matomo proxy worker entrypoint.</item>
  <item>Architecture review: call validateProxyEnv before proxying — fail fast with diagnostic 500 on misconfigured env.</item>
  <item>RFC-0751: Multi-tenant path-based routing — no env validation needed, upstream hosts come from bundled registry.</item>
  <item>ADR-0034: Shared multi-tenant Worker — no env-based config, upstream registry bundled at deploy time.</item>
</CHANGE_SUMMARY>
*/

import { proxyMatomoRequest } from "./proxy.ts";

export default {
  fetch(request: Request): Promise<Response> {
    return proxyMatomoRequest(request);
  },
};
