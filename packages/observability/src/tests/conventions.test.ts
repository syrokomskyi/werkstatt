import { describe, it, expect } from "vitest";
import { buildResourceAttributes, type WgogolResourceInput } from "../conventions.ts";

describe("buildResourceAttributes", () => {
  it("builds correct attributes for a site-layer signal", () => {
    const attrs = buildResourceAttributes({
      serviceName: "webgogol-com",
      layer: "site",
      environment: "production",
      siteId: "webgogol-com",
    });
    expect(attrs).toEqual([
      { key: "service.name", value: { stringValue: "webgogol-com" } },
      { key: "deployment.environment", value: { stringValue: "production" } },
      { key: "wgogol.layer", value: { stringValue: "site" } },
      { key: "wgogol.site_id", value: { stringValue: "webgogol-com" } },
    ]);
  });

  it("includes service.version when provided", () => {
    const attrs = buildResourceAttributes({
      serviceName: "fleet-probe-runner",
      layer: "probe",
      environment: "production",
      siteId: "webgogol-com",
      serviceVersion: "abc1234",
    });
    expect(attrs.some((a) => a.key === "service.version")).toBe(true);
    expect(attrs.find((a) => a.key === "service.version")?.value.stringValue).toBe("abc1234");
  });

  it("throws when siteId is missing for site layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "webgogol-com",
        layer: "site",
        environment: "production",
      } as WgogolResourceInput),
    ).toThrow(/siteId is required/);
  });

  it("throws when siteId is missing for probe layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "fleet-probe-runner",
        layer: "probe",
        environment: "production",
      } as WgogolResourceInput),
    ).toThrow(/siteId is required/);
  });

  it("throws when siteId is missing for delivery layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "cf-analytics-poller",
        layer: "delivery",
        environment: "production",
      } as WgogolResourceInput),
    ).toThrow(/siteId is required/);
  });

  it("does not require siteId for factory layer", () => {
    const attrs = buildResourceAttributes({
      serviceName: "site-kernel",
      layer: "factory",
      environment: "ci",
    });
    expect(attrs.some((a) => a.key === "wgogol.site_id")).toBe(false);
  });

  it("throws for invalid layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "test",
        layer: "invalid" as never,
        environment: "production",
      }),
    ).toThrow(/not in the closed vocabulary/);
  });

  it("throws for invalid environment", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "test",
        layer: "factory",
        environment: "staging" as never,
      }),
    ).toThrow(/not in the closed vocabulary/);
  });

  it("throws when serviceName is empty", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "",
        layer: "factory",
        environment: "ci",
      }),
    ).toThrow(/serviceName is required/);
  });
});
