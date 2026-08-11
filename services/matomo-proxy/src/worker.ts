/*
<MODULE_CONTRACT>
<purpose>Expose the Cloudflare Worker fetch entrypoint for the RFC-0305 first-party Matomo proxy.</purpose>
<non-goals>
  <item>Do not own reusable proxy rules, app config, provisioning, reporting, or export logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add first-party Matomo proxy worker entrypoint.</item>
  <item>RFC-0751: Multi-tenant path-based routing — no env validation needed, upstream hosts come from bundled registry.</item>
  <item>ADR-0034: Shared multi-tenant Worker — no env-based config, upstream registry bundled at deploy time.</item>
</CHANGE_SUMMARY>
*/

import { proxyMatomoRequest } from "./proxy.ts";
import { createMetricsPusher } from "@warpgogol/werkstatt-site/observability";

interface Env {
  WARPGOGOL_OTLP_ENDPOINT: string;
  WARPGOGOL_OTLP_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/_wg/analytics/health") {
      const pusher = createMetricsPusher(
        { serviceName: "matomo-proxy", layer: "back", environment: "production" },
        { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
      );
      if (pusher) {
        pusher.gaugeSet("warpgogol_back_up", 1, { service: "matomo-proxy" });
        await pusher.flush();
      }
      return new Response(JSON.stringify({ status: "ok", service: "matomo-proxy" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const pusher = createMetricsPusher(
      { serviceName: "matomo-proxy", layer: "back", environment: "production" },
      { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
    );
    const response = await proxyMatomoRequest(request);
    if (pusher) {
      const statusClass = `${Math.floor(response.status / 100)}xx`;
      pusher.counterAdd("warpgogol_back_requests_total", 1, {
        service: "matomo-proxy",
        status_class: statusClass,
      });
      pusher.gaugeSet("warpgogol_back_up", response.ok ? 1 : 0, { service: "matomo-proxy" });
      await pusher.flush();
    }
    return response;
  },
};
