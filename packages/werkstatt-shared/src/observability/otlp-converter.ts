/*
<MODULE_CONTRACT>
<purpose>Pure conversion from accumulated metric points to OTLP metric points (RFC-0337). Extracted from pusher.ts for testability without HTTP I/O.</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not perform HTTP — that lives in pusher.ts.</item>
  <item>Do not validate metric names/labels — pusher.ts validates at accumulation time.</item>
</non-goals>
@ai-invariant: Histogram bucket boundaries are inclusive — a value exactly on a bound goes into the lower bucket (value <= bounds[i]).
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract pure OTLP conversion pipeline from pusher.ts flush() for interface-level testability.</item>
</CHANGE_SUMMARY>
*/

import { findMetricSpec } from "./metric-registry.ts";
import {
  nowUnixNano,
  type OtlpGaugePoint,
  type OtlpHistogramPoint,
  type OtlpMetricPoint,
  type OtlpSumPoint,
  type UnixNanoString,
} from "./otlp-json.ts";
import type { OtlpKeyValue } from "./conventions.ts";

export interface AccumulatedPoint {
  name: string;
  labels: Record<string, string>;
  value: number;
  kind: "counter" | "gauge" | "histogram";
}

function labelsToAttributes(labels: Record<string, string>): OtlpKeyValue[] {
  return Object.entries(labels).map(([key, value]) => ({
    key,
    value: { stringValue: value },
  }));
}

export function convertAccumulatedToOtlp(
  points: readonly AccumulatedPoint[],
  startTimeNano: UnixNanoString,
): OtlpMetricPoint[] {
  const byName = new Map<string, AccumulatedPoint[]>();
  for (const pt of points) {
    const existing = byName.get(pt.name);
    if (existing) {
      existing.push(pt);
    } else {
      byName.set(pt.name, [pt]);
    }
  }

  const otlpPoints: OtlpMetricPoint[] = [];

  for (const [name, group] of byName) {
    const spec = findMetricSpec(name);
    if (!spec) continue;

    if (spec.kind === "counter") {
      const sumPoints: OtlpSumPoint[] = group.map((pt) => ({
        asDouble: pt.value,
        startTimeUnixNano: startTimeNano,
        timeUnixNano: nowUnixNano(),
        attributes: labelsToAttributes(pt.labels),
      }));
      otlpPoints.push({
        name,
        kind: "sum",
        unit: spec.unit,
        isMonotonic: true,
        sumPoints,
      });
    } else if (spec.kind === "gauge") {
      const gaugePoints: OtlpGaugePoint[] = group.map((pt) => ({
        asDouble: pt.value,
        timeUnixNano: nowUnixNano(),
        attributes: labelsToAttributes(pt.labels),
      }));
      otlpPoints.push({
        name,
        kind: "gauge",
        unit: spec.unit,
        gaugePoints,
      });
    } else if (spec.kind === "histogram") {
      const bounds = spec.buckets ?? [];
      const bucketCounts = new Array(bounds.length + 1).fill(0) as number[];
      let sum = 0;
      for (const pt of group) {
        sum += pt.value;
        let placed = false;
        for (let i = 0; i < bounds.length; i++) {
          if (pt.value <= bounds[i]!) {
            bucketCounts[i]!++;
            placed = true;
            break;
          }
        }
        if (!placed) {
          bucketCounts[bucketCounts.length - 1]!++;
        }
      }
      const histogramPoints: OtlpHistogramPoint[] = [
        {
          startTimeUnixNano: startTimeNano,
          timeUnixNano: nowUnixNano() as UnixNanoString,
          count: String(group.length),
          sum,
          bucketCounts: bucketCounts.map(String),
          explicitBounds: [...bounds],
        },
      ];
      otlpPoints.push({
        name,
        kind: "histogram",
        unit: spec.unit,
        histogramPoints,
      });
    }
  }

  return otlpPoints;
}
