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
</CHANGE_SUMMARY>
*/

import { proxyMatomoRequest } from "./proxy.ts";
import { validateProxyEnv, type MatomoProxyEnv } from "./config.ts";

export default {
  fetch(request: Request, env: MatomoProxyEnv): Promise<Response> {
    try {
      validateProxyEnv(env);
    } catch {
      return Promise.resolve(
        new Response(null, {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }),
      );
    }
    return proxyMatomoRequest(request, env);
  },
};
