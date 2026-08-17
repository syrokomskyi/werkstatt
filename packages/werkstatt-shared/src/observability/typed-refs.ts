/*
<MODULE_CONTRACT>
<purpose>Maintains packages/observability/src/typed-refs.ts as an authored observability authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not define metric specs (kind, help, unit, buckets) — metric-registry.ts is the runtime authority.</item>
</non-goals>
@ai-invariant: METRIC_REFS keys must match WARPGOGOL_METRIC_REGISTRY names exactly — enforced by compile-time type assertion below.
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add typed metric references for compile-time label-key enforcement across all consumers.</item>
  <item>wg-review: correct non-goals, add compile-time registry-coverage assertion.</item>
  <item>RFC-0807: add back prefix metric refs for service health monitoring.</item>
</CHANGE_SUMMARY>
*/

import type { MetricsPusher } from "./pusher.ts";
import { WARPGOGOL_METRIC_REGISTRY } from "./metric-registry.ts";

type LabelKeys<L extends readonly string[]> = L[number];
type LabelMap<L extends readonly string[]> = Partial<Record<LabelKeys<L>, string>>;

export interface TypedCounter<L extends readonly string[]> {
  readonly name: string;
  add(pusher: MetricsPusher, value: number, labels?: LabelMap<L>): void;
}

export interface TypedGauge<L extends readonly string[]> {
  readonly name: string;
  set(pusher: MetricsPusher, value: number, labels?: LabelMap<L>): void;
}

export interface TypedHistogram<L extends readonly string[]> {
  readonly name: string;
  record(pusher: MetricsPusher, value: number, labels?: LabelMap<L>): void;
}

function defineCounter<L extends readonly string[]>(name: string, _labelKeys: L): TypedCounter<L> {
  return {
    name,
    add(pusher, value, labels) {
      pusher.counterAdd(name, value, (labels ?? {}) as Record<string, string>);
    },
  };
}

function defineGauge<L extends readonly string[]>(name: string, _labelKeys: L): TypedGauge<L> {
  return {
    name,
    set(pusher, value, labels) {
      pusher.gaugeSet(name, value, (labels ?? {}) as Record<string, string>);
    },
  };
}

function defineHistogram<L extends readonly string[]>(
  name: string,
  _labelKeys: L,
): TypedHistogram<L> {
  return {
    name,
    record(pusher, value, labels) {
      pusher.histogramRecord(name, value, (labels ?? {}) as Record<string, string>);
    },
  };
}

export const METRIC_REFS = {
  warpgogol_factory_smoke_total: defineCounter("warpgogol_factory_smoke_total", [] as const),
  warpgogol_factory_command_runs_total: defineCounter("warpgogol_factory_command_runs_total", [
    "command",
    "status",
    "site_id",
  ] as const),
  warpgogol_factory_command_duration_seconds: defineHistogram(
    "warpgogol_factory_command_duration_seconds",
    ["command", "site_id"] as const,
  ),
  warpgogol_factory_diagnostics_total: defineCounter("warpgogol_factory_diagnostics_total", [
    "command",
    "severity",
    "site_id",
  ] as const),
  warpgogol_probe_up: defineGauge("warpgogol_probe_up", ["site_id", "route"] as const),
  warpgogol_probe_ttfb_seconds: defineGauge("warpgogol_probe_ttfb_seconds", [
    "site_id",
    "route",
  ] as const),
  warpgogol_probe_http_status_class_total: defineCounter(
    "warpgogol_probe_http_status_class_total",
    ["site_id", "route", "status_class"] as const,
  ),
  warpgogol_probe_content_ok: defineGauge("warpgogol_probe_content_ok", [
    "site_id",
    "route",
  ] as const),
  warpgogol_probe_cert_expiry_days: defineGauge("warpgogol_probe_cert_expiry_days", [
    "site_id",
  ] as const),
  warpgogol_probe_deep_ok: defineGauge("warpgogol_probe_deep_ok", ["site_id"] as const),
  warpgogol_delivery_requests_total: defineCounter("warpgogol_delivery_requests_total", [
    "site_id",
    "cache_status",
    "status_class",
  ] as const),
  warpgogol_delivery_bytes_total: defineCounter("warpgogol_delivery_bytes_total", [
    "site_id",
  ] as const),
  warpgogol_workers_requests_total: defineCounter("warpgogol_workers_requests_total", [
    "site_id",
  ] as const),
  warpgogol_workers_errors_total: defineCounter("warpgogol_workers_errors_total", [
    "site_id",
  ] as const),
  warpgogol_back_requests_total: defineCounter("warpgogol_back_requests_total", [
    "service",
    "status_class",
  ] as const),
  warpgogol_back_up: defineGauge("warpgogol_back_up", ["service"] as const),
  warpgogol_back_last_run_total: defineCounter("warpgogol_back_last_run_total", [
    "service",
    "status",
  ] as const),
  warpgogol_back_last_error_total: defineCounter("warpgogol_back_last_error_total", [
    "service",
  ] as const),
  warpgogol_back_queue_depth: defineGauge("warpgogol_back_queue_depth", ["service"] as const),
} as const;

// Compile-time assertion: every METRIC_REFS key must be a declared registry metric name.
// If a metric is added to METRIC_REFS but not to WARPGOGOL_METRIC_REGISTRY (or vice versa),
// this type expression produces a compile error.
type _RegistryNames = (typeof WARPGOGOL_METRIC_REGISTRY)[number]["name"];
type _RefKeys = keyof typeof METRIC_REFS;
type _DriftCheck = _RefKeys extends _RegistryNames ? true : never;
const _assertNoDrift: _DriftCheck = true;
void _assertNoDrift;
