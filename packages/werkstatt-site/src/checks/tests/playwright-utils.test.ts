import { describe, it, expect, vi } from "vitest";
import { isExternalUrl, evaluateInPage, blockExternalRequests } from "../playwright-utils.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Unit tests for playwright-utils (RFC-0843) — shared Playwright utilities
    for type-safe evaluate, external request blocking, and URL classification.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0843: initial creation — tests for isExternalUrl, evaluateInPage, blockExternalRequests.</item>
</CHANGE_SUMMARY>
*/

describe("isExternalUrl", () => {
  const allowedOrigin = "http://127.0.0.1:3000";

  it("returns false for same-origin URLs", () => {
    expect(isExternalUrl("http://127.0.0.1:3000/page", allowedOrigin)).toBe(false);
  });

  it("returns true for different hostname", () => {
    expect(isExternalUrl("http://example.com/page", allowedOrigin)).toBe(true);
  });

  it("returns true for different port", () => {
    expect(isExternalUrl("http://127.0.0.1:8080/page", allowedOrigin)).toBe(true);
  });

  it("returns false for data: URLs", () => {
    expect(isExternalUrl("data:text/plain,hello", allowedOrigin)).toBe(false);
  });

  it("returns false for blob: URLs", () => {
    expect(isExternalUrl("blob:http://127.0.0.1:3000/uuid", allowedOrigin)).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isExternalUrl("not-a-url", allowedOrigin)).toBe(false);
  });
});

describe("evaluateInPage", () => {
  it("calls page.evaluate with the function and returns result", async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue(42),
    } as any;

    const result = await evaluateInPage(mockPage, () => 42);

    expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
    expect(result).toBe(42);
  });

  it("passes through return value from page.evaluate", async () => {
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({ width: 100, height: 200 }),
    } as any;

    const result = await evaluateInPage(mockPage, () => ({ width: 100, height: 200 }));

    expect(result).toEqual({ width: 100, height: 200 });
  });
});

describe("blockExternalRequests", () => {
  it("calls context.route with glob pattern", async () => {
    const mockContext = {
      route: vi.fn().mockResolvedValue(undefined),
    } as any;

    await blockExternalRequests(mockContext, "http://127.0.0.1:3000");

    expect(mockContext.route).toHaveBeenCalledTimes(1);
    expect(mockContext.route.mock.calls[0][0]).toBe("**/*");
  });

  it("aborts external URLs and continues local URLs", async () => {
    let capturedCallback: ((route: any) => any) | null = null;
    const mockContext = {
      route: vi.fn().mockImplementation((_pattern: string, cb: (route: any) => any) => {
        capturedCallback = cb;
        return Promise.resolve();
      }),
    } as any;

    await blockExternalRequests(mockContext, "http://127.0.0.1:3000");

    expect(capturedCallback).not.toBeNull();
    const routeCallback = capturedCallback!;

    // External URL → abort
    const externalRoute = {
      request: () => ({ url: () => "http://example.com/analytics.js" }),
      abort: vi.fn(),
      continue: vi.fn(),
    };
    await routeCallback(externalRoute);
    expect(externalRoute.abort).toHaveBeenCalledTimes(1);
    expect(externalRoute.continue).not.toHaveBeenCalled();

    // Local URL → continue
    const localRoute = {
      request: () => ({ url: () => "http://127.0.0.1:3000/index.html" }),
      abort: vi.fn(),
      continue: vi.fn(),
    };
    await routeCallback(localRoute);
    expect(localRoute.continue).toHaveBeenCalledTimes(1);
    expect(localRoute.abort).not.toHaveBeenCalled();

    // data: URL → continue (not external)
    const dataRoute = {
      request: () => ({ url: () => "data:text/plain,hello" }),
      abort: vi.fn(),
      continue: vi.fn(),
    };
    await routeCallback(dataRoute);
    expect(dataRoute.continue).toHaveBeenCalledTimes(1);
    expect(dataRoute.abort).not.toHaveBeenCalled();
  });
});
