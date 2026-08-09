/*
<MODULE_CONTRACT>
<purpose>Minimal OTLP/HTTP JSON push client for metrics (RFC-0337). Zero-dependency, Workers-compatible, fire-and-forget.</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not retry — one flush = at most one HTTP request.</item>
  <item>Do not throw from flush — always resolve with delivery status.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation.</item>
  <item>Deepening: extract OTLP conversion to otlp-converter.ts pure function.</item>
</CHANGE_SUMMARY>
*/

import { buildResourceAttributes, type WarpgogolResourceInput } from "./conventions.ts";
import { findMetricSpec, isLabelKeyForbidden, isMetricNameValid } from "./metric-registry.ts";
import { encodeOtlpMetrics, nowUnixNano } from "./otlp-json.ts";
import { convertAccumulatedToOtlp, type AccumulatedPoint } from "./otlp-converter.ts";
import type { OtlpTransport } from "./otlp-transport.ts";
import { createOtlpHttpTransport } from "./otlp-transport.ts";
import type { MetricsPusherEnv } from "./env-resolver.ts";
import { resolvePusherEnv, detectEnvironment } from "./env-resolver.ts";

export type { MetricsPusherEnv } from "./env-resolver.ts";

export interface MetricsPusher {
  counterAdd(name: string, value: number, labels?: Record<string, string>): void;
  gaugeSet(name: string, value: number, labels?: Record<string, string>): void;
  histogramRecord(name: string, value: number, labels?: Record<string, string>): void;
  flush(): Promise<{ delivered: boolean; reason?: string }>;
}

const SCOPE_NAME = "@warpgogol/observability";
const SCOPE_VERSION = "1";
const DEFAULT_TIMEOUT_MS = 2000;

export function createMetricsPusher(
  resource: WarpgogolResourceInput,
  env?: MetricsPusherEnv,
  options?: { timeoutMs?: number },
): MetricsPusher | null {
  const resolved = resolvePusherEnv(env);
  if (!resolved.endpoint || !resolved.token) {
    return null;
  }

  const endpoint = resolved.endpoint;
  const token = resolved.token;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const environment = resource.environment ?? detectEnvironment();
  const layer = resource.layer;

  const resourceInput: WarpgogolResourceInput = {
    ...resource,
    environment,
    layer,
  };

  const points: AccumulatedPoint[] = [];
  const startTimeNano = nowUnixNano();
  let _droppedCount = 0;

  const isStrict = environment === "development" || environment === "ci";

  function validateMetric(name: string, labels: Record<string, string>): void {
    if (!isMetricNameValid(name)) {
      const msg = `[observability] metric name "${name}" does not match the naming grammar`;
      if (isStrict) throw new Error(msg);
      _droppedCount++;
      return;
    }
    const spec = findMetricSpec(name);
    if (!spec) {
      const msg = `[observability] metric name "${name}" is not declared in WARPGOGOL_METRIC_REGISTRY`;
      if (isStrict) throw new Error(msg);
      _droppedCount++;
      return;
    }
    for (const key of Object.keys(labels)) {
      if (isLabelKeyForbidden(key)) {
        const msg = `[observability] label key "${key}" is forbidden for metric "${name}"`;
        if (isStrict) throw new Error(msg);
        _droppedCount++;
        return;
      }
      if (!spec.labelKeys.includes(key)) {
        const msg = `[observability] label key "${key}" is not declared for metric "${name}"`;
        if (isStrict) throw new Error(msg);
        _droppedCount++;
        return;
      }
    }
  }

  function addPoint(
    name: string,
    value: number,
    labels: Record<string, string>,
    kind: AccumulatedPoint["kind"],
  ): void {
    try {
      validateMetric(name, labels);
    } catch {
      return;
    }
    points.push({ name, labels, value, kind });
  }

  const transport: OtlpTransport = createOtlpHttpTransport({ endpoint, token, timeoutMs });

  const pusher: MetricsPusher = {
    counterAdd(name, value, labels = {}) {
      addPoint(name, value, labels, "counter");
    },
    gaugeSet(name, value, labels = {}) {
      addPoint(name, value, labels, "gauge");
    },
    histogramRecord(name, value, labels = {}) {
      addPoint(name, value, labels, "histogram");
    },
    async flush() {
      if (points.length === 0) {
        return { delivered: true };
      }

      const resourceAttrs = buildResourceAttributes(resourceInput);

      const otlpPoints = convertAccumulatedToOtlp(points, startTimeNano);

      if (otlpPoints.length === 0) {
        return { delivered: true };
      }

      const body = encodeOtlpMetrics(resourceAttrs, otlpPoints, SCOPE_NAME, SCOPE_VERSION);

      return transport.send(JSON.stringify(body));
    },
  };

  return pusher;
}
