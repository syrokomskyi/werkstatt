import { test, expect, describe, vi } from "vitest";
import { createMatomoAdapter } from "../adapter.ts";
import { StubMatomoTransport } from "../transport.ts";
import { DEFAULT_MATOMO_BINDING } from "../binding.ts";
import type { GrowthAdapterConfig } from "@warpgogol/growth/adapter";

function makeConfig(vendor: Record<string, string> = {}): GrowthAdapterConfig {
  return {
    appId: "test-app",
    locale: "de",
    vendor: { siteId: "1", ...vendor },
  };
}

describe("createMatomoAdapter", () => {
  test("id is matomo", () => {
    const adapter = createMatomoAdapter({ transport: new StubMatomoTransport() });
    expect(adapter.id).toBe("matomo");
  });

  test("accepts includes page-view and all binding events", () => {
    const adapter = createMatomoAdapter({ transport: new StubMatomoTransport() });
    expect(adapter.accepts).toContain("page-view");
    expect(adapter.accepts).toContain("contact.phone_click");
    expect(adapter.accepts).toContain("contact.form_submit");
  });
});

describe("init", () => {
  test("warns and skips when siteId is missing", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await adapter.init({ appId: "test", locale: "de", vendor: {} });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("siteId"));
    expect(stub.calls.length).toBe(0);
    warnSpy.mockRestore();
  });

  test("skips when not on production host", async () => {
    const stub = new StubMatomoTransport();
    stub.productionHost = false;
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig({ productionHost: "example.com" }));
    expect(stub.calls.length).toBe(0);
    expect(stub.scripts.length).toBe(0);
  });

  test("skips when opted out", async () => {
    const stub = new StubMatomoTransport();
    stub.optedOut = true;
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    expect(stub.calls.length).toBe(0);
  });

  test("pushes required queue calls and injects script", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig({ proxyBaseUrl: "/_wg/analytics/" }));
    const callNames = stub.calls.map((c) => c[0]);
    expect(callNames).toContain("disableCookies");
    expect(callNames).toContain("setDoNotTrack");
    expect(callNames).toContain("setTrackerUrl");
    expect(callNames).toContain("setSiteId");
    expect(callNames).not.toContain("trackPageView"); // skipped in init
    expect(stub.scripts.length).toBe(1);
    expect(stub.scripts[0]).toContain("matomo.js");
  });

  test("setTrackerUrl uses proxyBaseUrl + endpointPath", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig({ proxyBaseUrl: "/_wg/analytics/" }));
    const trackerCall = stub.calls.find((c) => c[0] === "setTrackerUrl");
    expect(trackerCall).toBeTruthy();
    expect(trackerCall![1]).toBe("/_wg/analytics/matomo.php");
  });

  test("falls back to binding proxyPath when proxyBaseUrl not set", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    const trackerCall = stub.calls.find((c) => c[0] === "setTrackerUrl");
    expect(trackerCall![1]).toBe("/_wg/analytics/matomo.php");
  });

  test("normalizes base URL without trailing slash", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig({ proxyBaseUrl: "/_wg/analytics" }));
    const trackerCall = stub.calls.find((c) => c[0] === "setTrackerUrl");
    expect(trackerCall![1]).toBe("/_wg/analytics/matomo.php");
  });

  test("pushes custom dimensions when vendor provides values and ids", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(
      makeConfig({
        clientId: "client-123",
        "dimension.client_id": "1",
        messkanonVersion: "1.0.0",
        "dimension.messkanon_version": "2",
      }),
    );
    const dimCalls = stub.calls.filter((c) => c[0] === "setCustomDimension");
    expect(dimCalls.length).toBeGreaterThanOrEqual(2);
  });

  test("setRequestMethod is pushed when configured", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig({ requestMethod: "POST" }));
    const methodCalls = stub.calls.filter((c) => c[0] === "setRequestMethod");
    expect(methodCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("track", () => {
  test("trackPageView is sent for first page-view only", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    adapter.track({
      name: "page-view",
      payload: { locale: "de", path: "/" },
      timestamp: new Date().toISOString(),
    });
    expect(stub.calls.some((c) => c[0] === "trackPageView")).toBe(true);
    // Second page-view should not trigger another trackPageView
    stub.calls.length = 0;
    adapter.track({
      name: "page-view",
      payload: { locale: "de", path: "/about" },
      timestamp: new Date().toISOString(),
    });
    expect(stub.calls.some((c) => c[0] === "trackPageView")).toBe(false);
  });

  test("contact event maps to trackEvent with category/action/name", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    // Reset calls from init
    stub.calls.length = 0;
    adapter.track({
      name: "contact.phone_click",
      payload: { locale: "de", placement: "header" },
      timestamp: new Date().toISOString(),
    });
    const trackEventCall = stub.calls.find((c) => c[0] === "trackEvent");
    expect(trackEventCall).toBeTruthy();
    expect(trackEventCall![1]).toBe("contact");
    expect(trackEventCall![2]).toBe("phone_click");
    expect(trackEventCall![3]).toBe("header");
  });

  test("does not track before init", () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    adapter.track({
      name: "page-view",
      payload: { locale: "de", path: "/" },
      timestamp: new Date().toISOString(),
    });
    expect(stub.calls.length).toBe(0);
  });

  test("unmapped event is silently dropped", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    stub.calls.length = 0;
    adapter.track({
      name: "cta-click" as never,
      payload: { locale: "de", label: "hero" } as never,
      timestamp: new Date().toISOString(),
    } as never);
    expect(stub.calls.length).toBe(0);
  });
});

describe("destroy", () => {
  test("resets state so track is no-op after destroy", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    adapter.destroy?.();
    stub.calls.length = 0;
    adapter.track({
      name: "page-view",
      payload: { locale: "de", path: "/" },
      timestamp: new Date().toISOString(),
    });
    expect(stub.calls.length).toBe(0);
  });

  test("page-view is tracked again after re-init", async () => {
    const stub = new StubMatomoTransport();
    const adapter = createMatomoAdapter({ transport: stub });
    await adapter.init(makeConfig());
    adapter.destroy?.();
    await adapter.init(makeConfig());
    stub.calls.length = 0;
    adapter.track({
      name: "page-view",
      payload: { locale: "de", path: "/" },
      timestamp: new Date().toISOString(),
    });
    expect(stub.calls.some((c) => c[0] === "trackPageView")).toBe(true);
  });
});

describe("identifySegment", () => {
  test("does not throw", async () => {
    const adapter = createMatomoAdapter({ transport: new StubMatomoTransport() });
    expect(() => adapter.identifySegment?.(null)).not.toThrow();
    expect(() => adapter.identifySegment?.("some-segment")).not.toThrow();
  });
});

describe("DEFAULT_MATOMO_BINDING", () => {
  test("has tracker with required queue calls", () => {
    expect(DEFAULT_MATOMO_BINDING.tracker.requiredQueueCalls.length).toBeGreaterThan(0);
    expect(DEFAULT_MATOMO_BINDING.tracker.requiredQueueCalls).toContain("setTrackerUrl");
    expect(DEFAULT_MATOMO_BINDING.tracker.requiredQueueCalls).toContain("setSiteId");
  });

  test("has contact events", () => {
    const eventIds = DEFAULT_MATOMO_BINDING.events.map((e) => e.semanticId);
    expect(eventIds).toContain("contact.phone_click");
    expect(eventIds).toContain("contact.form_submit");
  });

  test("has visit and action dimensions", () => {
    expect(DEFAULT_MATOMO_BINDING.dimensions.visit.length).toBeGreaterThan(0);
    expect(DEFAULT_MATOMO_BINDING.dimensions.action.length).toBeGreaterThan(0);
  });

  test("all events have category, action, and nameFrom", () => {
    for (const evt of DEFAULT_MATOMO_BINDING.events) {
      expect(evt.matomo.category).toBeTruthy();
      expect(evt.matomo.action).toBeTruthy();
      expect(evt.matomo.nameFrom).toBeTruthy();
    }
  });
});
