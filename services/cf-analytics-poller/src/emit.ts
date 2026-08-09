/*
<MODULE_CONTRACT>
<purpose>Dispatch metric points to a pusher by metric kind (RFC-0343).</purpose>
<non-goals>
  <item>Do not define metric specs or label keys — those live in @warpgogol/werkstatt-site/observability.</item>
  <item>Do not perform network I/O or watermark management.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract emitPoints from loop.ts to deduplicate metric-kind dispatch.</item>
</CHANGE_SUMMARY>
*/

import { findMetricSpec, type MetricsPusher } from "@warpgogol/werkstatt-site/observability";
import type { MetricPoint } from "./poll.ts";

export function emitPoints(pusher: MetricsPusher, points: MetricPoint[]): void {
  for (const point of points) {
    const spec = findMetricSpec(point.metric);
    if (!spec) continue;
    if (spec.kind === "counter") {
      pusher.counterAdd(point.metric, point.value, point.labels);
    } else if (spec.kind === "histogram") {
      pusher.histogramRecord(point.metric, point.value, point.labels);
    } else {
      pusher.gaugeSet(point.metric, point.value, point.labels);
    }
  }
}
