/*
<MODULE_CONTRACT>
<purpose>Encapsulate OTLP pusher resource identity for the CF analytics poller (RFC-0343).</purpose>
<non-goals>
  <item>Do not define metric specs, label keys, or flush logic — those live in @gogol/observability.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract createPollerPusher to deduplicate resource attributes between run-once and runLoop.</item>
</CHANGE_SUMMARY>
*/

import { createMetricsPusher } from "@gogol/observability";

export function createPollerPusher() {
  return createMetricsPusher({
    serviceName: "cf-analytics-poller",
    layer: "delivery",
    environment: "production",
  });
}
