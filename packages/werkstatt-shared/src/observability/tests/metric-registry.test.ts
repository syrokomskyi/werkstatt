import { describe, it, expect } from "vitest";
import {
  WARPGOGOL_METRIC_REGISTRY,
  findMetricSpec,
  isMetricNameValid,
  isLabelKeyForbidden,
  FORBIDDEN_LABEL_KEYS,
} from "../metric-registry.ts";

describe("WARPGOGOL_METRIC_REGISTRY", () => {
  it("contains the smoke metric", () => {
    const smoke = findMetricSpec("warpgogol_factory_smoke_total");
    expect(smoke).toBeDefined();
    expect(smoke?.kind).toBe("counter");
    expect(smoke?.labelKeys).toEqual([]);
  });

  it("has no duplicate names", () => {
    const names = WARPGOGOL_METRIC_REGISTRY.map((s) => s.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it("all names match the naming grammar", () => {
    for (const spec of WARPGOGOL_METRIC_REGISTRY) {
      expect(isMetricNameValid(spec.name)).toBe(true);
    }
  });

  it("no entry has a forbidden label key", () => {
    for (const spec of WARPGOGOL_METRIC_REGISTRY) {
      for (const key of spec.labelKeys) {
        expect(isLabelKeyForbidden(key)).toBe(false);
      }
    }
  });

  it("contains all 5 back metrics with correct kinds and labels (RFC-0807)", () => {
    const requests = findMetricSpec("warpgogol_back_requests_total");
    expect(requests).toBeDefined();
    expect(requests?.kind).toBe("counter");
    expect(requests?.labelKeys).toEqual(["service", "status_class"]);

    const up = findMetricSpec("warpgogol_back_up");
    expect(up).toBeDefined();
    expect(up?.kind).toBe("gauge");
    expect(up?.labelKeys).toEqual(["service"]);

    const lastRun = findMetricSpec("warpgogol_back_last_run_total");
    expect(lastRun).toBeDefined();
    expect(lastRun?.kind).toBe("counter");
    expect(lastRun?.labelKeys).toEqual(["service", "status"]);

    const lastError = findMetricSpec("warpgogol_back_last_error_total");
    expect(lastError).toBeDefined();
    expect(lastError?.kind).toBe("counter");
    expect(lastError?.labelKeys).toEqual(["service"]);

    const queueDepth = findMetricSpec("warpgogol_back_queue_depth");
    expect(queueDepth).toBeDefined();
    expect(queueDepth?.kind).toBe("gauge");
    expect(queueDepth?.labelKeys).toEqual(["service"]);
  });
});

describe("isMetricNameValid", () => {
  it("accepts valid factory metric names", () => {
    expect(isMetricNameValid("warpgogol_factory_smoke_total")).toBe(true);
    expect(isMetricNameValid("warpgogol_factory_command_duration_seconds")).toBe(true);
  });

  it("accepts valid probe metric names", () => {
    expect(isMetricNameValid("warpgogol_probe_up")).toBe(true);
  });

  it("accepts valid delivery metric names", () => {
    expect(isMetricNameValid("warpgogol_delivery_requests_total")).toBe(true);
  });

  it("accepts valid workers metric names", () => {
    expect(isMetricNameValid("warpgogol_workers_errors_total")).toBe(true);
  });

  it("accepts valid back metric names (RFC-0807)", () => {
    expect(isMetricNameValid("warpgogol_back_requests_total")).toBe(true);
    expect(isMetricNameValid("warpgogol_back_up")).toBe(true);
    expect(isMetricNameValid("warpgogol_back_last_run_total")).toBe(true);
    expect(isMetricNameValid("warpgogol_back_last_error_total")).toBe(true);
    expect(isMetricNameValid("warpgogol_back_queue_depth")).toBe(true);
  });

  it("rejects names without the warpgogol_ prefix", () => {
    expect(isMetricNameValid("factory_smoke_total")).toBe(false);
  });

  it("rejects names with wrong prefix domain", () => {
    expect(isMetricNameValid("warpgogol_foo_smoke_total")).toBe(false);
  });

  it("rejects names with uppercase", () => {
    expect(isMetricNameValid("warpgogol_factory_Smoke")).toBe(false);
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
