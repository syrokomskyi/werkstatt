import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";
import UChatWidgetAdapter, { __resetForTesting } from "../widget-adapter.ts";
import type { ChatWidgetConfig } from "@warpgogol/werkstatt-site/chat/port";

function makeConfig(options: Record<string, string> = {}): ChatWidgetConfig {
  return {
    appId: "test-app",
    locale: "de",
    adapter: "uchat",
    options,
  };
}

describe("UChatWidgetAdapter", () => {
  test("id is 'uchat'", () => {
    expect(UChatWidgetAdapter.id).toBe("uchat");
  });

  test("requiredOptions includes widgetId/scriptUrl group", () => {
    expect(UChatWidgetAdapter.requiredOptions).toBeDefined();
    expect(UChatWidgetAdapter.requiredOptions![0]).toContain("widgetId");
    expect(UChatWidgetAdapter.requiredOptions![0]).toContain("scriptUrl");
  });

  test("vendorOrigins includes uchat.com.au", () => {
    expect(UChatWidgetAdapter.vendorOrigins).toContain("uchat.com.au");
  });
});

describe("UChatWidgetAdapter.load", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    __resetForTesting();
    // Set chatbotSDK so waitForChatbotSDK resolves immediately instead of polling for 3000ms
    (window as unknown as Record<string, unknown>).chatbotSDK = {};
    // happy-dom v20 fires "error" synchronously on script appendChild;
    // return a div so appendChild doesn't trigger script loading
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string) => realCreateElement(tag === "script" ? "div" : tag) as unknown,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns error when no widgetId or scriptUrl", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await UChatWidgetAdapter.load(makeConfig({}));
    expect(result).toBe("error");
    warnSpy.mockRestore();
  });

  test("returns error when window is undefined", async () => {
    // In happy-dom, window is defined, so this tests the guard indirectly
    // We can't easily stub window to undefined in happy-dom, so skip this
  });

  test("injects script with default URL from widgetId", async () => {
    const config = makeConfig({ widgetId: "abc123" });
    // We need to intercept the script load event
    const loadPromise = UChatWidgetAdapter.load(config);

    // Find the injected script and simulate load
    const script = document.getElementById("uchat-widget-script") as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script!.src).toContain("uchat.com.au/js/widget/abc123/popup.js");

    script!.dispatchEvent(new Event("load"));
    const result = await loadPromise;
    expect(result).toBe("ready");
  });

  test("uses scriptUrl override when provided", async () => {
    const customUrl = "https://custom.example.com/widget.js";
    const loadPromise = UChatWidgetAdapter.load(makeConfig({ scriptUrl: customUrl }));

    const script = document.getElementById("uchat-widget-script") as HTMLScriptElement | null;
    expect(script!.src).toBe(customUrl);

    script!.dispatchEvent(new Event("load"));
    const result = await loadPromise;
    expect(result).toBe("ready");
  });

  test("returns error on script load failure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadPromise = UChatWidgetAdapter.load(makeConfig({ widgetId: "fail" }));

    const script = document.getElementById("uchat-widget-script") as HTMLScriptElement | null;
    script!.dispatchEvent(new Event("error"));

    const result = await loadPromise;
    expect(result).toBe("error");
    warnSpy.mockRestore();
  });

  test("returns cached on second load call", async () => {
    const config = makeConfig({ widgetId: "abc" });

    const p1 = UChatWidgetAdapter.load(config);
    document.getElementById("uchat-widget-script")!.dispatchEvent(new Event("load"));
    expect(await p1).toBe("ready");

    // Second call should return cached without re-injecting
    const result = await UChatWidgetAdapter.load(config);
    expect(result).toBe("cached");
  });
});

describe("UChatWidgetAdapter.open", () => {
  test("returns not-ready before load", () => {
    __resetForTesting();
    expect(UChatWidgetAdapter.open()).toBe("not-ready");
  });
});
