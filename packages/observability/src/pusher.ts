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

import {
  buildResourceAttributes,
  type WgogolEnvironment,
  type WgogolLayer,
  type WgogolResourceInput,
} from "./conventions.ts";
import { findMetricSpec, isLabelKeyForbidden, isMetricNameValid } from "./metric-registry.ts";
import { encodeOtlpMetrics, nowUnixNano } from "./otlp-json.ts";
import { convertAccumulatedToOtlp, type AccumulatedPoint } from "./otlp-converter.ts";

export interface MetricsPusherEnv {
  endpoint?: string;
  token?: string;
}

export interface MetricsPusher {
  counterAdd(name: string, value: number, labels?: Record<string, string>): void;
  gaugeSet(name: string, value: number, labels?: Record<string, string>): void;
  histogramRecord(name: string, value: number, labels?: Record<string, string>): void;
  flush(): Promise<{ delivered: boolean; reason?: string }>;
}

const SCOPE_NAME = "@gogol/observability";
const SCOPE_VERSION = "1";
const DEFAULT_TIMEOUT_MS = 2000;

interface ProcessEnvLike {
  env?: Record<string, string | undefined>;
}

function getGlobalProcess(): ProcessEnvLike | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const g = globalThis as Record<string, unknown>;
  return typeof g["process"] === "object" && g["process"] !== null
    ? (g["process"] as ProcessEnvLike)
    : undefined;
}

function resolveEnv(env?: MetricsPusherEnv): { endpoint?: string; token?: string } {
  if (env) return env;
  const proc = getGlobalProcess();
  if (proc?.env) {
    return {
      endpoint: proc.env["WGOGOL_OTLP_ENDPOINT"],
      token: proc.env["WGOGOL_OTLP_TOKEN"],
    };
  }
  return {};
}

function detectEnvironment(): WgogolEnvironment {
  const proc = getGlobalProcess();
  const raw = proc?.env ? (proc.env["WGOGOL_DEPLOYMENT_ENV"] ?? proc.env["NODE_ENV"]) : undefined;
  if (raw === "production") return "production";
  if (raw === "preview") return "preview";
  if (raw === "ci") return "ci";
  return "development";
}

export function createMetricsPusher(
  resource: WgogolResourceInput,
  env?: MetricsPusherEnv,
  options?: { timeoutMs?: number },
): MetricsPusher | null {
  const resolved = resolveEnv(env);
  if (!resolved.endpoint || !resolved.token) {
    return null;
  }

  const endpoint = resolved.endpoint;
  const token = resolved.token;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const environment: WgogolEnvironment = resource.environment ?? detectEnvironment();
  const layer: WgogolLayer = resource.layer;

  const resourceInput: WgogolResourceInput = {
    ...resource,
    environment,
    layer,
  };

  const points: AccumulatedPoint[] = [];
  const startTimeNano = nowUnixNano();
  let droppedCount = 0;

  const isStrict = environment === "development" || environment === "ci";

  function validateMetric(name: string, labels: Record<string, string>): void {
    if (!isMetricNameValid(name)) {
      const msg = `[observability] metric name "${name}" does not match the naming grammar`;
      if (isStrict) throw new Error(msg);
      droppedCount++;
      return;
    }
    const spec = findMetricSpec(name);
    if (!spec) {
      const msg = `[observability] metric name "${name}" is not declared in WGOGOL_METRIC_REGISTRY`;
      if (isStrict) throw new Error(msg);
      droppedCount++;
      return;
    }
    for (const key of Object.keys(labels)) {
      if (isLabelKeyForbidden(key)) {
        const msg = `[observability] label key "${key}" is forbidden for metric "${name}"`;
        if (isStrict) throw new Error(msg);
        droppedCount++;
        return;
      }
      if (!spec.labelKeys.includes(key)) {
        const msg = `[observability] label key "${key}" is not declared for metric "${name}"`;
        if (isStrict) throw new Error(msg);
        droppedCount++;
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

      const url = `${endpoint.replace(/\/$/, "")}/v1/metrics`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!response.ok) {
            return {
              delivered: false,
              reason: `HTTP ${response.status} ${response.statusText}`,
            };
          }
          return { delivered: true };
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { delivered: false, reason };
      }
    },
  };

  return pusher;
}
