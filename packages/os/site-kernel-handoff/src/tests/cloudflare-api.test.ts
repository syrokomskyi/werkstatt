/*
<MODULE_CONTRACT>
<purpose>RFC-0752: tests for the Cloudflare REST API client (cloudflare-api.ts).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0752: initial API client tests — listDnsRecords, createDnsRecord, listWorkersRoutes, createWorkersRoute, auth header.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listDnsRecords,
  createDnsRecord,
  listWorkersRoutes,
  createWorkersRoute,
} from "../leitstand/adapters/cloudflare-api.ts";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

test("listDnsRecords sends GET with auth header and optional name filter", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(true, 200, {
      success: true,
      errors: [],
      messages: [],
      result: [
        { id: "rec1", type: "CNAME", name: "test.example.com", content: "target.workers.dev", proxied: true },
      ],
    }),
  );

  const result = await listDnsRecords("zone123", "token456", "test.example.com");

  expect(mockFetch).toHaveBeenCalledOnce();
  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toContain("/zones/zone123/dns_records");
  expect(url).toContain("name=test.example.com");
  expect(opts.method).toBeUndefined();
  expect(opts.headers.Authorization).toBe("Bearer token456");
  expect(result).toHaveLength(1);
  expect(result[0].name).toBe("test.example.com");
});

test("listDnsRecords without name filter omits query param", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(true, 200, { success: true, errors: [], messages: [], result: [] }),
  );

  await listDnsRecords("zone123", "token456");

  const [url] = mockFetch.mock.calls[0];
  expect(url).not.toContain("name=");
});

test("createDnsRecord sends POST with correct payload", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(true, 200, {
      success: true,
      errors: [],
      messages: [],
      result: { id: "new-rec", type: "CNAME", name: "test.example.com", content: "target.workers.dev", proxied: true },
    }),
  );

  const result = await createDnsRecord("zone123", "token456", {
    type: "CNAME",
    name: "test.example.com",
    content: "target.workers.dev",
    proxied: true,
  });

  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toContain("/zones/zone123/dns_records");
  expect(opts.method).toBe("POST");
  expect(opts.headers.Authorization).toBe("Bearer token456");
  const body = JSON.parse(opts.body);
  expect(body.type).toBe("CNAME");
  expect(body.name).toBe("test.example.com");
  expect(result.id).toBe("new-rec");
});

test("listWorkersRoutes sends GET with auth header", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(true, 200, {
      success: true,
      errors: [],
      messages: [],
      result: [
        { id: "route1", pattern: "test.example.com/*", script: "test-worker" },
      ],
    }),
  );

  const result = await listWorkersRoutes("zone123", "token456");

  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toContain("/zones/zone123/workers/routes");
  expect(opts.headers.Authorization).toBe("Bearer token456");
  expect(result).toHaveLength(1);
  expect(result[0].pattern).toBe("test.example.com/*");
});

test("createWorkersRoute sends POST with correct payload", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(true, 200, {
      success: true,
      errors: [],
      messages: [],
      result: { id: "new-route", pattern: "test.example.com/*", script: "test-worker" },
    }),
  );

  const result = await createWorkersRoute("zone123", "token456", {
    pattern: "test.example.com/*",
    script: "test-worker",
  });

  const [url, opts] = mockFetch.mock.calls[0];
  expect(url).toContain("/zones/zone123/workers/routes");
  expect(opts.method).toBe("POST");
  const body = JSON.parse(opts.body);
  expect(body.pattern).toBe("test.example.com/*");
  expect(body.script).toBe("test-worker");
  expect(result.id).toBe("new-route");
});

test("API errors throw with descriptive message", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(true, 200, {
      success: false,
      errors: [{ code: 1003, message: "Invalid or missing zone id" }],
      messages: [],
      result: null,
    }),
  );

  await expect(listDnsRecords("bad-zone", "token456")).rejects.toThrow(
    "listDnsRecords API errors: 1003: Invalid or missing zone id",
  );
});

test("HTTP error throws with status and body", async () => {
  mockFetch.mockResolvedValue(
    mockResponse(false, 401, "Unauthorized"),
  );

  await expect(listDnsRecords("zone123", "bad-token")).rejects.toThrow(
    "listDnsRecords failed: HTTP 401",
  );
});
