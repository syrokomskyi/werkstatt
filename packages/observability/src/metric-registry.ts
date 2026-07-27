/*
<MODULE_CONTRACT>
<purpose>Closed metric catalog for the Warpgogol observability port (RFC-0337). Every metric emitted anywhere in the ecosystem MUST be declared here.</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation with smoke metric only. RFC-0340/0341/0343 append entries.</item>
</CHANGE_SUMMARY>
*/

export type WarpgogolMetricKind = "counter" | "gauge" | "histogram";

export interface WarpgogolMetricSpec {
  name: string;
  kind: WarpgogolMetricKind;
  help: string;
  labelKeys: readonly string[];
  unit?: string;
  buckets?: readonly number[];
}

export const METRIC_NAME_PATTERN = /^warpgogol_(factory|probe|delivery|workers)_[a-z0-9_]+$/;

export const FORBIDDEN_LABEL_KEYS: readonly string[] = [
  "user_id",
  "session_id",
  "request_id",
  "run_id",
  "url",
  "path",
  "email",
];

export const WARPGOGOL_METRIC_REGISTRY: readonly WarpgogolMetricSpec[] = [
  {
    name: "warpgogol_factory_smoke_total",
    kind: "counter",
    help: "Smoke-test counter emitted by observability.factory.smoke to verify the OTLP pipe end-to-end (RFC-0340).",
    labelKeys: [],
    unit: "1",
  },
  {
    name: "warpgogol_factory_command_runs_total",
    kind: "counter",
    help: "Total kernel command executions by command name and outcome (RFC-0340).",
    labelKeys: ["command", "status", "site_id"],
    unit: "1",
  },
  {
    name: "warpgogol_factory_command_duration_seconds",
    kind: "histogram",
    help: "Kernel command execution duration in seconds (RFC-0340).",
    labelKeys: ["command", "site_id"],
    unit: "s",
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
  },
  {
    name: "warpgogol_factory_diagnostics_total",
    kind: "counter",
    help: "Total diagnostics emitted by kernel commands by severity (RFC-0340).",
    labelKeys: ["command", "severity", "site_id"],
    unit: "1",
  },
  {
    name: "warpgogol_probe_up",
    kind: "gauge",
    help: "1 = site route is up (status 2xx/3xx AND sentinel ok); else 0 (RFC-0341).",
    labelKeys: ["site_id", "route"],
    unit: "1",
  },
  {
    name: "warpgogol_probe_ttfb_seconds",
    kind: "gauge",
    help: "Last observed time-to-first-byte in seconds (RFC-0341).",
    labelKeys: ["site_id", "route"],
    unit: "s",
  },
  {
    name: "warpgogol_probe_http_status_class_total",
    kind: "counter",
    help: "Total probe requests by HTTP status class (RFC-0341).",
    labelKeys: ["site_id", "route", "status_class"],
    unit: "1",
  },
  {
    name: "warpgogol_probe_content_ok",
    kind: "gauge",
    help: "1 = content sentinel matched; 0 = sentinel failed (RFC-0341).",
    labelKeys: ["site_id", "route"],
    unit: "1",
  },
  {
    name: "warpgogol_probe_cert_expiry_days",
    kind: "gauge",
    help: "Days until TLS certificate expiry (RFC-0341).",
    labelKeys: ["site_id"],
    unit: "d",
  },
  {
    name: "warpgogol_probe_deep_ok",
    kind: "gauge",
    help: "Phase 2 deep probe result: 1 = ok, 0 = failed (RFC-0341 Phase 2).",
    labelKeys: ["site_id"],
    unit: "1",
  },
  {
    name: "warpgogol_delivery_requests_total",
    kind: "counter",
    help: "Total HTTP requests served by Cloudflare per site, cache status, and status class (RFC-0343).",
    labelKeys: ["site_id", "cache_status", "status_class"],
    unit: "1",
  },
  {
    name: "warpgogol_delivery_bytes_total",
    kind: "counter",
    help: "Total bytes served by Cloudflare per site (RFC-0343).",
    labelKeys: ["site_id"],
    unit: "By",
  },
  {
    name: "warpgogol_workers_requests_total",
    kind: "counter",
    help: "Total Cloudflare Worker invocations per site (RFC-0343).",
    labelKeys: ["site_id"],
    unit: "1",
  },
  {
    name: "warpgogol_workers_errors_total",
    kind: "counter",
    help: "Total Cloudflare Worker errors per site (RFC-0343).",
    labelKeys: ["site_id"],
    unit: "1",
  },
];

export function findMetricSpec(name: string): WarpgogolMetricSpec | undefined {
  return WARPGOGOL_METRIC_REGISTRY.find((spec) => spec.name === name);
}

export function isMetricNameValid(name: string): boolean {
  return METRIC_NAME_PATTERN.test(name);
}

export function isLabelKeyForbidden(key: string): boolean {
  return FORBIDDEN_LABEL_KEYS.includes(key);
}
