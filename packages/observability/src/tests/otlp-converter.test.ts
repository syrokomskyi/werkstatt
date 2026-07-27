import { describe, it, expect } from "vitest";
import { convertAccumulatedToOtlp, type AccumulatedPoint } from "../otlp-converter.ts";

const START_TIME = "1751884500000000000";

describe("convertAccumulatedToOtlp", () => {
  it("returns empty array for empty input", () => {
    const result = convertAccumulatedToOtlp([], START_TIME);
    expect(result).toEqual([]);
  });

  it("skips points with undeclared metric names", () => {
    const points: AccumulatedPoint[] = [
      { name: "wgogol_unknown_metric", labels: {}, value: 1, kind: "counter" },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    expect(result).toEqual([]);
  });

  it("converts a counter point to a sum metric", () => {
    const points: AccumulatedPoint[] = [
      { name: "wgogol_factory_smoke_total", labels: {}, value: 1, kind: "counter" },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("sum");
    expect(result[0]!.name).toBe("wgogol_factory_smoke_total");
    expect(result[0]!.isMonotonic).toBe(true);
    expect(result[0]!.sumPoints).toHaveLength(1);
    expect(result[0]!.sumPoints![0]!.asDouble).toBe(1);
    expect(result[0]!.sumPoints![0]!.startTimeUnixNano).toBe(START_TIME);
  });

  it("groups multiple counter points by name into one sum metric", () => {
    const points: AccumulatedPoint[] = [
      {
        name: "wgogol_factory_command_runs_total",
        labels: { command: "build.check", status: "pass" },
        value: 1,
        kind: "counter",
      },
      {
        name: "wgogol_factory_command_runs_total",
        labels: { command: "build.check", status: "fail" },
        value: 1,
        kind: "counter",
      },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    expect(result).toHaveLength(1);
    expect(result[0]!.sumPoints).toHaveLength(2);
  });

  it("converts a gauge point to a gauge metric", () => {
    const points: AccumulatedPoint[] = [
      {
        name: "wgogol_probe_up",
        labels: { site_id: "webgogol-com", route: "/" },
        value: 1,
        kind: "gauge",
      },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("gauge");
    expect(result[0]!.gaugePoints).toHaveLength(1);
    expect(result[0]!.gaugePoints![0]!.asDouble).toBe(1);
  });

  it("converts histogram points with correct bucket counts", () => {
    const points: AccumulatedPoint[] = [
      {
        name: "wgogol_factory_command_duration_seconds",
        labels: { command: "build.check" },
        value: 0.3,
        kind: "histogram",
      },
      {
        name: "wgogol_factory_command_duration_seconds",
        labels: { command: "build.check" },
        value: 1.5,
        kind: "histogram",
      },
      {
        name: "wgogol_factory_command_duration_seconds",
        labels: { command: "build.check" },
        value: 700,
        kind: "histogram",
      },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("histogram");
    const hp = result[0]!.histogramPoints![0]!;
    expect(hp.count).toBe("3");
    expect(hp.sum).toBe(701.8);
    expect(hp.bucketCounts).toHaveLength(11);
    expect(hp.explicitBounds).toEqual([0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]);
    expect(hp.bucketCounts[0]).toBe("1");
    expect(hp.bucketCounts[2]).toBe("1");
    expect(hp.bucketCounts[10]).toBe("1");
  });

  it("places value exactly on a bucket boundary in the lower bucket", () => {
    const points: AccumulatedPoint[] = [
      {
        name: "wgogol_factory_command_duration_seconds",
        labels: { command: "build.check" },
        value: 1,
        kind: "histogram",
      },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    const hp = result[0]!.histogramPoints![0]!;
    expect(hp.bucketCounts[1]).toBe("1");
    expect(hp.bucketCounts[2]).toBe("0");
  });

  it("handles mixed kinds in a single call", () => {
    const points: AccumulatedPoint[] = [
      { name: "wgogol_factory_smoke_total", labels: {}, value: 1, kind: "counter" },
      {
        name: "wgogol_probe_up",
        labels: { site_id: "webgogol-com", route: "/" },
        value: 1,
        kind: "gauge",
      },
      {
        name: "wgogol_factory_command_duration_seconds",
        labels: { command: "build.check" },
        value: 2,
        kind: "histogram",
      },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    expect(result).toHaveLength(3);
    const kinds = result.map((r) => r.kind).sort();
    expect(kinds).toEqual(["gauge", "histogram", "sum"]);
  });

  it("preserves label attributes in output points", () => {
    const points: AccumulatedPoint[] = [
      {
        name: "wgogol_probe_up",
        labels: { site_id: "webgogol-com", route: "/" },
        value: 1,
        kind: "gauge",
      },
    ];
    const result = convertAccumulatedToOtlp(points, START_TIME);
    const attrs = result[0]!.gaugePoints![0]!.attributes!;
    expect(attrs).toEqual([
      { key: "site_id", value: { stringValue: "webgogol-com" } },
      { key: "route", value: { stringValue: "/" } },
    ]);
  });
});
