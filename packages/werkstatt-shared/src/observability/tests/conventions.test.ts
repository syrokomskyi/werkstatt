import { describe, it, expect } from "vitest";
import { buildResourceAttributes, type WarpgogolResourceInput } from "../conventions.ts";

describe("buildResourceAttributes", () => {
  it("builds correct attributes for a site-layer signal", () => {
    const attrs = buildResourceAttributes({
      serviceName: "warpgogol-com",
      layer: "site",
      environment: "production",
      siteId: "warpgogol-com",
    });
    expect(attrs).toEqual([
      { key: "service.name", value: { stringValue: "warpgogol-com" } },
      { key: "deployment.environment", value: { stringValue: "production" } },
      { key: "warpgogol.layer", value: { stringValue: "site" } },
      { key: "warpgogol.site_id", value: { stringValue: "warpgogol-com" } },
    ]);
  });

  it("includes service.version when provided", () => {
    const attrs = buildResourceAttributes({
      serviceName: "fleet-probe-runner",
      layer: "probe",
      environment: "production",
      siteId: "warpgogol-com",
      serviceVersion: "abc1234",
    });
    expect(attrs.some((a) => a.key === "service.version")).toBe(true);
    expect(attrs.find((a) => a.key === "service.version")?.value.stringValue).toBe("abc1234");
  });

  it("throws when siteId is missing for site layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "warpgogol-com",
        layer: "site",
        environment: "production",
      } as WarpgogolResourceInput),
    ).toThrow(/siteId is required/);
  });

  it("throws when siteId is missing for probe layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "fleet-probe-runner",
        layer: "probe",
        environment: "production",
      } as WarpgogolResourceInput),
    ).toThrow(/siteId is required/);
  });

  it("throws when siteId is missing for delivery layer", () => {
    expect(() =>
      buildResourceAttributes({
        serviceName: "cf-analytics-poller",
        layer: "delivery",
        environment: "production",
      } as WarpgogolResourceInput),
    ).toThrow(/siteId is required/);
  });

  it("does not require siteId for factory layer", () => {
    const attrs = buildResourceAttributes({
      serviceName: "site-kernel",
      layer: "factory",
      environment: "ci",
    });
    expect(attrs.some((a) => a.key === "warpgogol.site_id")).toBe(false);
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
