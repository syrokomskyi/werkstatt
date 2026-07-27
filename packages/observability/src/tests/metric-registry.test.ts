import { describe, it, expect } from "vitest";
import {
  WGOGOL_METRIC_REGISTRY,
  findMetricSpec,
  isMetricNameValid,
  isLabelKeyForbidden,
  FORBIDDEN_LABEL_KEYS,
} from "../metric-registry.ts";

describe("WGOGOL_METRIC_REGISTRY", () => {
  it("contains the smoke metric", () => {
    const smoke = findMetricSpec("wgogol_factory_smoke_total");
    expect(smoke).toBeDefined();
    expect(smoke?.kind).toBe("counter");
    expect(smoke?.labelKeys).toEqual([]);
  });

  it("has no duplicate names", () => {
    const names = WGOGOL_METRIC_REGISTRY.map((s) => s.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it("all names match the naming grammar", () => {
    for (const spec of WGOGOL_METRIC_REGISTRY) {
      expect(isMetricNameValid(spec.name)).toBe(true);
    }
  });

  it("no entry has a forbidden label key", () => {
    for (const spec of WGOGOL_METRIC_REGISTRY) {
      for (const key of spec.labelKeys) {
        expect(isLabelKeyForbidden(key)).toBe(false);
      }
    }
  });
});

describe("isMetricNameValid", () => {
  it("accepts valid factory metric names", () => {
    expect(isMetricNameValid("wgogol_factory_smoke_total")).toBe(true);
    expect(isMetricNameValid("wgogol_factory_command_duration_seconds")).toBe(true);
  });

  it("accepts valid probe metric names", () => {
    expect(isMetricNameValid("wgogol_probe_up")).toBe(true);
  });

  it("accepts valid delivery metric names", () => {
    expect(isMetricNameValid("wgogol_delivery_requests_total")).toBe(true);
  });

  it("accepts valid workers metric names", () => {
    expect(isMetricNameValid("wgogol_workers_errors_total")).toBe(true);
  });

  it("rejects names without the wgogol_ prefix", () => {
    expect(isMetricNameValid("factory_smoke_total")).toBe(false);
  });

  it("rejects names with wrong prefix domain", () => {
    expect(isMetricNameValid("wgogol_foo_smoke_total")).toBe(false);
  });

  it("rejects names with uppercase", () => {
    expect(isMetricNameValid("wgogol_factory_Smoke")).toBe(false);
  });
});

describe("isLabelKeyForbidden", () => {
  it("returns true for all forbidden keys", () => {
    for (const key of FORBIDDEN_LABEL_KEYS) {
      expect(isLabelKeyForbidden(key)).toBe(true);
    }
  });

  it("returns false for allowed keys", () => {
    expect(isLabelKeyForbidden("site_id")).toBe(false);
    expect(isLabelKeyForbidden("status_class")).toBe(false);
    expect(isLabelKeyForbidden("command")).toBe(false);
  });
});
