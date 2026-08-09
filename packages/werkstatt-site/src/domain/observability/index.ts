/*
<MODULE_CONTRACT>
<purpose>Barrel export for @warpgogol/werkstatt-site/observability — the observability port package (RFC-0337).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation.</item>
  <item>Deepening: extract convertAccumulatedToOtlp pure function, add METRIC_REFS typed references, remove speculative exports.</item>
</CHANGE_SUMMARY>
*/

export {
  buildResourceAttributes,
  OTLP_ENDPOINT_ENV,
  OTLP_TOKEN_ENV,
  WARPGOGOL_ENVIRONMENTS,
  WARPGOGOL_LAYERS,
  type OtlpKeyValue,
  type WarpgogolEnvironment,
  type WarpgogolLayer,
  type WarpgogolResourceInput,
} from "./conventions.ts";

export {
  findMetricSpec,
  isLabelKeyForbidden,
  isMetricNameValid,
  FORBIDDEN_LABEL_KEYS,
  METRIC_NAME_PATTERN,
  WARPGOGOL_METRIC_REGISTRY,
  type WarpgogolMetricKind,
  type WarpgogolMetricSpec,
} from "./metric-registry.ts";

export {
  encodeOtlpMetrics,
  nowUnixNano,
  type OtlpGaugePoint,
  type OtlpHistogramPoint,
  type OtlpMetricPoint,
  type OtlpMetricsEnvelope,
  type OtlpSumPoint,
  type UnixNanoString,
} from "./otlp-json.ts";

export { createMetricsPusher, type MetricsPusher, type MetricsPusherEnv } from "./pusher.ts";

export { redactUrl } from "./redact.ts";

export {
  METRIC_REFS,
  type TypedCounter,
  type TypedGauge,
  type TypedHistogram,
} from "./typed-refs.ts";
