/*
<MODULE_CONTRACT>
<purpose>Run scheduled Cloudflare analytics polling cycles and push transformed delivery metrics (RFC-0343).</purpose>
<non-goals>
  <item>Do not define GraphQL query documents or transform Cloudflare responses inline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0343: initial implementation.</item>
  <item>Extract CloudflareAnalyticsClient adapter; accept client as runPollCycle parameter.</item>
  <item>Extract settledWindow into windowing.ts and metric dispatch into emit.ts.</item>
</CHANGE_SUMMARY>
*/

import { type MetricsPusher } from "@warpgogol/observability";
import { createPollerPusher } from "./pusher-factory.ts";
import { loadConfig } from "./config.ts";
import { transformZoneResponse, transformWorkersResponse, type MetricPoint } from "./poll.ts";
import { readWatermark, writeWatermark } from "./watermark.ts";
import { loadZoneMap } from "./zone-map.ts";
import {
  createCloudflareAnalyticsClient,
  type CloudflareAnalyticsClient,
} from "./cloudflare-client.ts";
import { settledWindow } from "./windowing.ts";
import { emitPoints } from "./emit.ts";

export async function runPollCycle(
  pusher: MetricsPusher,
  client?: CloudflareAnalyticsClient,
): Promise<MetricPoint[]> {
  const config = loadConfig();
  if (!config.cfApiToken) {
    console.log("[cf-analytics-poller] CF_ANALYTICS_API_TOKEN not set — skipping cycle");
    return [];
  }

  const cfClient = client ?? createCloudflareAnalyticsClient(config.cfApiToken);
  const zones = await loadZoneMap();
  const { since, until } = settledWindow();
  const allPoints: MetricPoint[] = [];

  // Skip if this window was already processed (crash recovery / restart)
  const watermark = await readWatermark();
  if (watermark && watermark.lastProcessedUntil >= until) {
    console.log("[cf-analytics-poller] window already processed — skipping cycle");
    return [];
  }

  for (const zone of zones) {
    try {
      const zoneResponse = await cfClient.zoneHttpRequests(zone.zoneId, since, until);
      const zonePoints = transformZoneResponse(zone.siteId, zoneResponse as never);
      allPoints.push(...zonePoints);

      const workersResponse = await cfClient.workerInvocations(zone.zoneId, since, until);
      const workerPoints = transformWorkersResponse(
        zone.siteId,
        zone.workerScripts,
        workersResponse as never,
      );
      allPoints.push(...workerPoints);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[cf-analytics-poller] zone ${zone.siteId} error: ${msg}`);
    }
  }

  // Write-ahead watermark: persist before flush to prevent double-push
  await writeWatermark({ lastProcessedUntil: until });

  emitPoints(pusher, allPoints);
  pusher.flush();
  return allPoints;
}

export async function runLoop(): Promise<void> {
  const config = loadConfig();
  const pusher = createPollerPusher();
  if (!pusher) {
    console.error("[cf-analytics-poller] OTLP endpoint/token not configured — exiting");
    return;
  }
  const activePusher = pusher;

  async function cycle() {
    try {
      const points = await runPollCycle(activePusher);
      console.log(`[cf-analytics-poller] cycle complete: ${points.length} metric points`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[cf-analytics-poller] cycle error: ${msg}`);
    }
    const jitter = Math.floor(Math.random() * 15000) - 7500;
    const next = config.pollIntervalMs + jitter;
    setTimeout(() => cycle(), next);
  }

  cycle();
}
