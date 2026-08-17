/*
<MODULE_CONTRACT>
<purpose>OTLP/HTTP JSON envelope encoding for metrics (RFC-0337). Produces the exact wire format consumed by SigNoz.</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not perform HTTP — that lives in pusher.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type { OtlpKeyValue } from "./conventions.ts";

export type UnixNanoString = string;

export function nowUnixNano(): UnixNanoString {
  return String(Date.now() * 1_000_000);
}

export interface OtlpGaugePoint {
  asDouble: number;
  timeUnixNano: UnixNanoString;
  attributes?: OtlpKeyValue[];
}

export interface OtlpSumPoint {
  asDouble: number;
  startTimeUnixNano: UnixNanoString;
  timeUnixNano: UnixNanoString;
  attributes?: OtlpKeyValue[];
}

export interface OtlpHistogramPoint {
  startTimeUnixNano: UnixNanoString;
  timeUnixNano: UnixNanoString;
  count: string;
  sum: number;
  bucketCounts: string[];
  explicitBounds: number[];
  attributes?: OtlpKeyValue[];
}

export interface OtlpMetricPoint {
  name: string;
  kind: "gauge" | "sum" | "histogram";
  unit?: string;
  isMonotonic?: boolean;
  gaugePoints?: OtlpGaugePoint[];
  sumPoints?: OtlpSumPoint[];
  histogramPoints?: OtlpHistogramPoint[];
  buckets?: readonly number[];
}

export interface OtlpMetricsEnvelope {
  resourceMetrics: Array<{
    resource: { attributes: OtlpKeyValue[] };
    scopeMetrics: Array<{
      scope: { name: string; version: string };
      metrics: unknown[];
    }>;
  }>;
}

export function encodeOtlpMetrics(
  resourceAttributes: OtlpKeyValue[],
  points: OtlpMetricPoint[],
  scopeName: string,
  scopeVersion: string,
): OtlpMetricsEnvelope {
  const metrics: unknown[] = [];

  for (const point of points) {
    if (point.kind === "gauge" && point.gaugePoints) {
      metrics.push({
        name: point.name,
        ...(point.unit ? { unit: point.unit } : {}),
        gauge: {
          dataPoints: point.gaugePoints.map((dp) => ({
            asDouble: dp.asDouble,
            timeUnixNano: dp.timeUnixNano,
            ...(dp.attributes ? { attributes: dp.attributes } : {}),
          })),
        },
      });
    } else if (point.kind === "sum" && point.sumPoints) {
      metrics.push({
        name: point.name,
        ...(point.unit ? { unit: point.unit } : {}),
        sum: {
          aggregationTemporality: 1,
          isMonotonic: point.isMonotonic ?? true,
          dataPoints: point.sumPoints.map((dp) => ({
            asDouble: dp.asDouble,
            startTimeUnixNano: dp.startTimeUnixNano,
            timeUnixNano: dp.timeUnixNano,
            ...(dp.attributes ? { attributes: dp.attributes } : {}),
          })),
        },
      });
    } else if (point.kind === "histogram" && point.histogramPoints) {
      metrics.push({
        name: point.name,
        ...(point.unit ? { unit: point.unit } : {}),
        histogram: {
          aggregationTemporality: 1,
          dataPoints: point.histogramPoints.map((dp) => ({
            startTimeUnixNano: dp.startTimeUnixNano,
            timeUnixNano: dp.timeUnixNano,
            count: dp.count,
            sum: dp.sum,
            bucketCounts: dp.bucketCounts,
            explicitBounds: dp.explicitBounds,
            ...(dp.attributes ? { attributes: dp.attributes } : {}),
          })),
        },
      });
    }
  }

  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttributes },
        scopeMetrics: [
          {
            scope: { name: scopeName, version: scopeVersion },
            metrics,
          },
        ],
      },
    ],
  };
}
