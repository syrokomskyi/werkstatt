/*
<MODULE_CONTRACT>
  <purpose>RFC-0899: Unit tests for access protection middleware logic — constant-time comparison, host matching, PIN gating.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0899: Initial middleware unit tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it, vi } from "vitest";

const mockEnv: Record<string, unknown> = {};
vi.mock("cloudflare:workers", () => ({
  env: mockEnv,
}));
vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));

describe("RFC-0899: access protection middleware", () => {
  async function loadMiddleware() {
    return (await import("../access-protection")).accessProtectionMiddleware as (
      context: unknown,
      next: () => Promise<Response>,
    ) => Promise<Response>;
  }

  function makeContext(host: string, authHeader?: string) {
    const headers = new Map<string, string>();
    headers.set("host", host);
    if (authHeader) headers.set("authorization", authHeader);
    return {
      request: {
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
      },
    };
  }

  async function runMiddleware(
    handler: (context: unknown, next: () => Promise<Response>) => Promise<Response>,
    host: string,
    authHeader?: string,
  ): Promise<Response & { _nextCalled: boolean }> {
    let nextCalled = false;
    const nextResponse = new Response("page content", { status: 200 });
    const result = await handler(makeContext(host, authHeader), async () => {
      nextCalled = true;
      return nextResponse;
    });
    return Object.assign(result, { _nextCalled: nextCalled });
  }

  it("passes through for main domain (no dev/alt prefix)", async () => {
    mockEnv.ACCESS_PIN = "1234";
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "example.com");
    expect(res._nextCalled).toBe(true);
    expect(res.status).toBe(200);
  });

  it("returns 401 for dev.* without auth header when PIN is set", async () => {
    mockEnv.ACCESS_PIN = "1234";
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "dev.example.com");
    expect(res._nextCalled).toBe(false);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Staging Access"');
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noai, noimageai");
  });

  it("returns 401 for alt.* without auth header when PIN is set", async () => {
    mockEnv.ACCESS_PIN = "1234";
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "alt.example.com");
    expect(res._nextCalled).toBe(false);
    expect(res.status).toBe(401);
  });

  it("passes through dev.* with correct Basic Auth", async () => {
    mockEnv.ACCESS_PIN = "1234";
    const expected = `Basic ${btoa("access:1234")}`;
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "dev.example.com", expected);
    expect(res._nextCalled).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noai, noimageai");
  });

  it("returns 401 for dev.* with wrong PIN", async () => {
    mockEnv.ACCESS_PIN = "1234";
    const wrong = `Basic ${btoa("access:9999")}`;
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "dev.example.com", wrong);
    expect(res._nextCalled).toBe(false);
    expect(res.status).toBe(401);
  });

  it("passes through dev.* when PIN is not set (no env var)", async () => {
    delete mockEnv.ACCESS_PIN;
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "dev.example.com");
    expect(res._nextCalled).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noai, noimageai");
  });

  it("passes through alt.* when PIN env is undefined", async () => {
    mockEnv.ACCESS_PIN = undefined;
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "alt.example.com");
    expect(res._nextCalled).toBe(true);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noai, noimageai");
  });

  it("does not set X-Robots-Tag on main domain", async () => {
    mockEnv.ACCESS_PIN = "1234";
    const handler = await loadMiddleware();
    const res = await runMiddleware(handler, "example.com");
    expect(res.headers.get("X-Robots-Tag")).toBe(null);
  });
});
