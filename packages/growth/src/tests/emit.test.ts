import { test, expect, describe, vi } from "vitest";
import { createEmitQueue } from "../emit.ts";
import { EVENT_NAMES, type GrowthAdapter, type EmittedEvent, type EventName } from "../adapter.ts";
import { KNOWN_ADAPTER_IDS } from "../registry.ts";
import { NullAdapter } from "../null-adapter.ts";
import { GrowthConfigSchema, GROWTH_CONFIG_SCRIPT_ID } from "../config.ts";

function makeStubAdapter(overrides: Partial<GrowthAdapter> = {}): GrowthAdapter {
  return {
    id: "stub",
    async init() {},
    track() {},
    ...overrides,
  };
}

describe("EVENT_NAMES", () => {
  test("is non-empty", () => {
    expect(EVENT_NAMES.length).toBeGreaterThan(5);
  });

  test("contains page-view and cta-click", () => {
    expect(EVENT_NAMES).toContain("page-view");
    expect(EVENT_NAMES).toContain("cta-click");
  });

  test("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const name of EVENT_NAMES) {
      expect(seen.has(name)).toBe(false);
      seen.add(name);
    }
  });
});

describe("KNOWN_ADAPTER_IDS", () => {
  test("contains null and matomo", () => {
    expect(KNOWN_ADAPTER_IDS).toContain("null");
    expect(KNOWN_ADAPTER_IDS).toContain("matomo");
  });
});

describe("createEmitQueue", () => {
  test("queues events when no adapter is registered", () => {
    const q = createEmitQueue();
    q.emit("page-view", { path: "/" });
    q.emit("cta-click", { label: "hero" });
    expect(q.getQueueLength()).toBe(2);
  });

  test("flushes queued events when adapter is set", () => {
    const q = createEmitQueue();
    const tracked: EmittedEvent[] = [];
    const adapter = makeStubAdapter({
      track: (e) => tracked.push(e as EmittedEvent),
    });

    q.emit("page-view", { path: "/" });
    expect(q.getQueueLength()).toBe(1);

    q.setActiveAdapter(adapter, "de");
    expect(q.getQueueLength()).toBe(0);
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.name).toBe("page-view");
    expect(tracked[0]!.payload.locale).toBe("en");
  });

  test("dispatches directly when adapter is already set", () => {
    const q = createEmitQueue();
    const tracked: EmittedEvent[] = [];
    q.setActiveAdapter(makeStubAdapter({ track: (e) => tracked.push(e as EmittedEvent) }), "en");
    q.emit("form-start", { formId: "contact" });
    expect(q.getQueueLength()).toBe(0);
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.payload.locale).toBe("en");
  });

  test("drops events not in adapter.accepts", () => {
    const q = createEmitQueue();
    const tracked: EmittedEvent[] = [];
    q.setActiveAdapter(
      makeStubAdapter({
        accepts: ["page-view"] as readonly EventName[],
        track: (e) => tracked.push(e as EmittedEvent),
      }),
      "de",
    );
    q.emit("page-view", { path: "/" });
    q.emit("cta-click", { label: "hero" });
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.name).toBe("page-view");
  });

  test("catches errors from adapter.track without throwing", () => {
    const q = createEmitQueue();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    q.setActiveAdapter(
      makeStubAdapter({
        track: () => {
          throw new Error("vendor error");
        },
      }),
      "de",
    );
    expect(() => q.emit("page-view", { path: "/" })).not.toThrow();
    warnSpy.mockRestore();
  });

  test("destroyAdapter clears queue and calls adapter.destroy", () => {
    const q = createEmitQueue();
    const destroyFn = vi.fn();
    q.setActiveAdapter(makeStubAdapter({ destroy: destroyFn }), "de");
    q.emit("page-view", { path: "/" });
    q.destroyAdapter();
    expect(destroyFn).toHaveBeenCalled();
    expect(q.getQueueLength()).toBe(0);
  });

  test("injects locale from setActiveAdapter into payload", () => {
    const q = createEmitQueue();
    const tracked: EmittedEvent[] = [];
    q.setActiveAdapter(makeStubAdapter({ track: (e) => tracked.push(e as EmittedEvent) }), "fr");
    q.emit("page-view", { path: "/about" });
    expect(tracked[0]!.payload.locale).toBe("fr");
  });

  test("timestamp is a valid ISO string", () => {
    const q = createEmitQueue();
    const tracked: EmittedEvent[] = [];
    q.setActiveAdapter(makeStubAdapter({ track: (e) => tracked.push(e as EmittedEvent) }), "de");
    q.emit("page-view", { path: "/" });
    expect(() => new Date(tracked[0]!.timestamp).toISOString()).not.toThrow();
  });
});

describe("NullAdapter", () => {
  test("id is null", () => {
    expect(NullAdapter.id).toBe("null");
  });

  test("accepts all EVENT_NAMES", () => {
    expect(NullAdapter.accepts).toEqual(EVENT_NAMES);
  });

  test("init resolves without error", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    await NullAdapter.init({ appId: "test", locale: "de", vendor: {} });
    debugSpy.mockRestore();
  });

  test("track does not throw", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() =>
      NullAdapter.track({
        name: "page-view",
        payload: { locale: "de", path: "/" },
        timestamp: new Date().toISOString(),
      }),
    ).not.toThrow();
    debugSpy.mockRestore();
  });

  test("identifySegment does not throw", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() => NullAdapter.identifySegment?.(null)).not.toThrow();
    debugSpy.mockRestore();
  });

  test("destroy does not throw", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(() => NullAdapter.destroy?.()).not.toThrow();
    debugSpy.mockRestore();
  });
});

describe("GrowthConfigSchema", () => {
  test("accepts a valid config with vendor", () => {
    const result = GrowthConfigSchema.safeParse({
      appId: "my-app",
      locale: "de",
      vendor: { adapter: "matomo", siteId: "1", endpoint: "https://a.example.com" },
    });
    expect(result.success).toBe(true);
  });

  test("defaults activeFunnels and activeExperiments to empty arrays", () => {
    const result = GrowthConfigSchema.safeParse({
      appId: "my-app",
      locale: "de",
      vendor: { adapter: "null" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activeFunnels).toEqual([]);
      expect(result.data.activeExperiments).toEqual([]);
    }
  });

  test("rejects empty appId", () => {
    expect(
      GrowthConfigSchema.safeParse({
        appId: "",
        locale: "de",
        vendor: { adapter: "null" },
      }).success,
    ).toBe(false);
  });

  test("rejects locale shorter than 2 chars", () => {
    expect(
      GrowthConfigSchema.safeParse({
        appId: "app",
        locale: "d",
        vendor: { adapter: "null" },
      }).success,
    ).toBe(false);
  });
});

describe("GROWTH_CONFIG_SCRIPT_ID", () => {
  test("is a non-empty string starting with __", () => {
    expect(GROWTH_CONFIG_SCRIPT_ID.startsWith("__")).toBe(true);
    expect(GROWTH_CONFIG_SCRIPT_ID.length).toBeGreaterThan(0);
  });
});
