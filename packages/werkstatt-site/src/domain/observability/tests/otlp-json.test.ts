import { describe, it, expect } from "vitest";
import { encodeOtlpMetrics, nowUnixNano, type OtlpMetricPoint } from "../otlp-json.ts";
import type { OtlpKeyValue } from "../conventions.ts";

const resourceAttrs: OtlpKeyValue[] = [
  { key: "service.name", value: { stringValue: "fleet-probe-runner" } },
  { key: "deployment.environment", value: { stringValue: "production" } },
  { key: "warpgogol.layer", value: { stringValue: "probe" } },
  { key: "warpgogol.site_id", value: { stringValue: "warpgogol-com" } },
];

describe("encodeOtlpMetrics", () => {
  it("encodes a gauge metric", () => {
    const points: OtlpMetricPoint[] = [
      {
        name: "warpgogol_probe_up",
        kind: "gauge",
        gaugePoints: [
          {
            asDouble: 1,
            timeUnixNano: "1751884800000000000",
            attributes: [{ key: "site_id", value: { stringValue: "warpgogol-com" } }],
          },
        ],
      },
    ];
    const env = encodeOtlpMetrics(resourceAttrs, points, "@warpgogol/observability", "1");
    expect(env.resourceMetrics).toHaveLength(1);
    expect(env.resourceMetrics[0]!.resource.attributes).toEqual(resourceAttrs);
    const scope = env.resourceMetrics[0]!.scopeMetrics[0]!;
    expect(scope.scope.name).toBe("@warpgogol/observability");
    expect(scope.scope.version).toBe("1");
    expect(scope.metrics).toHaveLength(1);
    const metric = scope.metrics[0] as Record<string, unknown>;
    expect(metric["name"]).toBe("warpgogol_probe_up");
    expect(metric["gauge"]).toBeDefined();
    const gauge = metric["gauge"] as { dataPoints: unknown[] };
    expect(gauge.dataPoints).toHaveLength(1);
    const dp = gauge.dataPoints[0] as Record<string, unknown>;
    expect(dp["asDouble"]).toBe(1);
    expect(dp["timeUnixNano"]).toBe("1751884800000000000");
  });

  it("encodes a delta sum (counter) with aggregationTemporality 1", () => {
    const points: OtlpMetricPoint[] = [
      {
        name: "warpgogol_probe_http_status_class_total",
        kind: "sum",
        unit: "1",
        isMonotonic: true,
        sumPoints: [
          {
            asDouble: 3,
            startTimeUnixNano: "1751884500000000000",
            timeUnixNano: "1751884800000000000",
            attributes: [{ key: "status_class", value: { stringValue: "2xx" } }],
          },
        ],
      },
    ];
    const env = encodeOtlpMetrics(resourceAttrs, points, "@warpgogol/observability", "1");
    const metric = env.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0] as Record<string, unknown>;
    expect(metric["name"]).toBe("warpgogol_probe_http_status_class_total");
    expect(metric["unit"]).toBe("1");
    const sum = metric["sum"] as {
      aggregationTemporality: number;
      isMonotonic: boolean;
      dataPoints: unknown[];
    };
    expect(sum.aggregationTemporality).toBe(1);
    expect(sum.isMonotonic).toBe(true);
    const dp = sum.dataPoints[0] as Record<string, unknown>;
    expect(dp["asDouble"]).toBe(3);
    expect(dp["startTimeUnixNano"]).toBe("1751884500000000000");
    expect(dp["timeUnixNano"]).toBe("1751884800000000000");
  });

  it("encodes a delta histogram with correct bucketCounts and explicitBounds", () => {
    const points: OtlpMetricPoint[] = [
      {
        name: "warpgogol_factory_command_duration_seconds",
        kind: "histogram",
        unit: "s",
        histogramPoints: [
          {
            startTimeUnixNano: "1751884500000000000",
            timeUnixNano: "1751884800000000000",
            count: "3",
            sum: 42.5,
            bucketCounts: ["0", "1", "1", "1", "0", "0", "0", "0", "0", "0", "0"],
            explicitBounds: [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
          },
        ],
      },
    ];
    const env = encodeOtlpMetrics(resourceAttrs, points, "@warpgogol/observability", "1");
    const metric = env.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0] as Record<string, unknown>;
    expect(metric["name"]).toBe("warpgogol_factory_command_duration_seconds");
    expect(metric["unit"]).toBe("s");
    const hist = metric["histogram"] as { aggregationTemporality: number; dataPoints: unknown[] };
    expect(hist.aggregationTemporality).toBe(1);
    const dp = hist.dataPoints[0] as Record<string, unknown>;
    expect(dp["count"]).toBe("3");
    expect(dp["sum"]).toBe(42.5);
    expect(dp["bucketCounts"]).toEqual(["0", "1", "1", "1", "0", "0", "0", "0", "0", "0", "0"]);
    expect(dp["explicitBounds"]).toEqual([0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]);
  });
});

describe("nowUnixNano", () => {
  it("returns a string of digits representing unix nanoseconds", () => {
    const nano = nowUnixNano();
    expect(typeof nano).toBe("string");
    expect(nano).toMatch(/^\d+$/);
    // Should be approximately Date.now() * 1e6
    const approx = Date.now() * 1_000_000;
    const parsed = Number(nano);
    expect(Math.abs(parsed - approx)).toBeLessThan(5_000_000_000);
  });
});
