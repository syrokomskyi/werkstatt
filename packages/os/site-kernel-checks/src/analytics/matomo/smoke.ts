/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/analytics/matomo/smoke.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not send network requests from validation commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add smoke-test scaffold for first-signal verification.</item>
</CHANGE_SUMMARY>
*/

export interface MatomoSmokeRequest {
  mode: "fixture" | "live";
  endpointPath: "matomo.php";
  event: "contact.route_click";
  eventName: "anfahrt";
  tokenAuth?: string;
  query: Record<string, string>;
}

export function buildMatomoSmokeRequest(
  siteId: string,
  mode: "fixture" | "live" = "fixture",
): MatomoSmokeRequest {
  return {
    mode,
    endpointPath: "matomo.php",
    event: "contact.route_click",
    eventName: "anfahrt",
    query: {
      idsite: siteId,
      rec: "1",
      e_c: "contact",
      e_a: "route_click",
      e_n: "anfahrt",
    },
  };
}
