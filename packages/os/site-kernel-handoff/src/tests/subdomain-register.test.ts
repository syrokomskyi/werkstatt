/*
<MODULE_CONTRACT>
<purpose>RFC-0752: tests for subdomain.register command handler — idempotency, new registration, mismatched records, missing env, missing zone ID, account fallback.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0752: initial subdomain.register tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSubdomainRegister } from "../subdomain/subdomain-register.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";

let tmpDir: string;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-subdomain-register-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
});

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    logger: {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    flags: {},
    env: {},
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, string>): KernelCommandInput {
  return { flags, argv: [] };
}

function createRegistry(
  workspaceRoot: string,
  opts?: { withZoneId?: boolean; withWorkersDevUrl?: boolean },
): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });
  const zoneIdLine = opts?.withZoneId !== false ? "\n    cloudflareZoneId: zone-123" : "";
  const workersDevUrlLine = opts?.withWorkersDevUrl
    ? "\n    workersDevUrl: \"https://matomo-proxy.myaccount.workers.dev\""
    : "";
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: warpgogol-com
    cosmicStar: Vega
    mirrors:
      - path: /tmp/test-cache
        storageType: non-bare
    pinnedPlatform: 1.0.0
    currentMission: null
    lastRelease: null
    status: active
    registeredAt: 2026-01-01T00:00:00.000Z
    notes: ""
    deployment:
      adapter: "cloudflare-workers"
      channels:
        dev:
          workerName: wg-dev
          url: https://dev.warpgogol.com
        alt:
          workerName: wg-alt
          url: https://alt.warpgogol.com
        main:
          workerName: wg-main
          url: https://warpgogol.com${zoneIdLine}
services:
  - id: matomo-proxy
    workerName: matomo-proxy
    hostedBy: studio${workersDevUrlLine}
    subdomains:
      - domain: matomo-proxy.warpgogol.com
        zone: warpgogol.com
`;
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

function mockResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function setupFetchMock(handlers: {
  dnsList?: () => Response;
  routeList?: () => Response;
  createDns?: () => Response;
  createRoute?: () => Response;
}): void {
  mockFetch.mockImplementation(async (url: string, opts?: { method?: string }) => {
    if (url.includes("/dns_records") && (!opts?.method || opts.method === "GET")) {
      return handlers.dnsList
        ? handlers.dnsList()
        : mockResponse(true, 200, { success: true, errors: [], messages: [], result: [] });
    }
    if (url.includes("/workers/routes") && (!opts?.method || opts.method === "GET")) {
      return handlers.routeList
        ? handlers.routeList()
        : mockResponse(true, 200, { success: true, errors: [], messages: [], result: [] });
    }
    if (url.includes("/dns_records") && opts?.method === "POST") {
      return handlers.createDns
        ? handlers.createDns()
        : mockResponse(true, 200, { success: true, errors: [], messages: [], result: {} });
    }
    if (url.includes("/workers/routes") && opts?.method === "POST") {
      return handlers.createRoute
        ? handlers.createRoute()
        : mockResponse(true, 200, { success: true, errors: [], messages: [], result: {} });
    }
    return mockResponse(true, 200, { success: true, errors: [], messages: [], result: [] });
  });
}

test("registers new DNS CNAME and Workers route when none exist", async () => {
  createRegistry(tmpDir);

  let createdDns = false;
  let createdRoute = false;

  setupFetchMock({
    createDns: () => {
      createdDns = true;
      return mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: {
          id: "dns-new",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "matomo-proxy.test-account.workers.dev",
          proxied: true,
        },
      });
    },
    createRoute: () => {
      createdRoute = true;
      return mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: {
          id: "route-new",
          pattern: "matomo-proxy.warpgogol.com/*",
          script: "matomo-proxy",
        },
      });
    },
  });

  const result = await runSubdomainRegister(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("registered");
  expect(result.data!.dnsRecord.created).toBe(true);
  expect(result.data!.dnsRecord.id).toBe("dns-new");
  expect(result.data!.workersRoute.created).toBe(true);
  expect(result.data!.workersRoute.id).toBe("route-new");
  expect(result.data!.dnsRecord.content).toBe("matomo-proxy.test-account.workers.dev");
  expect(createdDns).toBe(true);
  expect(createdRoute).toBe(true);
});

test("is idempotent — skips creation when DNS and route already correct", async () => {
  createRegistry(tmpDir);

  let createdDns = false;
  let createdRoute = false;

  setupFetchMock({
    dnsList: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            id: "dns-existing",
            type: "CNAME",
            name: "matomo-proxy.warpgogol.com",
            content: "matomo-proxy.test-account.workers.dev",
            proxied: true,
          },
        ],
      }),
    routeList: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            id: "route-existing",
            pattern: "matomo-proxy.warpgogol.com/*",
            script: "matomo-proxy",
          },
        ],
      }),
    createDns: () => {
      createdDns = true;
      return mockResponse(true, 200, { success: true, errors: [], messages: [], result: {} });
    },
    createRoute: () => {
      createdRoute = true;
      return mockResponse(true, 200, { success: true, errors: [], messages: [], result: {} });
    },
  });

  const result = await runSubdomainRegister(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("already-registered");
  expect(result.data!.dnsRecord.created).toBe(false);
  expect(result.data!.dnsRecord.id).toBe("dns-existing");
  expect(result.data!.workersRoute.created).toBe(false);
  expect(createdDns).toBe(false);
  expect(createdRoute).toBe(false);
});

test("errors when DNS record exists with wrong target", async () => {
  createRegistry(tmpDir);

  setupFetchMock({
    dnsList: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            id: "dns-wrong",
            type: "CNAME",
            name: "matomo-proxy.warpgogol.com",
            content: "wrong-target.workers.dev",
            proxied: true,
          },
        ],
      }),
  });

  await expect(
    runSubdomainRegister(makeInput({ service: "matomo-proxy" }), makeContext(tmpDir)),
  ).rejects.toThrow("DNS record for 'matomo-proxy.warpgogol.com' exists but has wrong values");
});

test("errors when Workers route exists with wrong script", async () => {
  createRegistry(tmpDir);

  setupFetchMock({
    dnsList: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            id: "dns-ok",
            type: "CNAME",
            name: "matomo-proxy.warpgogol.com",
            content: "matomo-proxy.test-account.workers.dev",
            proxied: true,
          },
        ],
      }),
    routeList: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            id: "route-wrong",
            pattern: "matomo-proxy.warpgogol.com/*",
            script: "wrong-worker",
          },
        ],
      }),
  });

  await expect(
    runSubdomainRegister(makeInput({ service: "matomo-proxy" }), makeContext(tmpDir)),
  ).rejects.toThrow("Workers route for 'matomo-proxy.warpgogol.com/*' exists but points to wrong script");
});

test("errors when CLOUDFLARE_API_TOKEN is missing", async () => {
  createRegistry(tmpDir);
  delete process.env.CLOUDFLARE_API_TOKEN;

  await expect(
    runSubdomainRegister(makeInput({ service: "matomo-proxy" }), makeContext(tmpDir)),
  ).rejects.toThrow("CLOUDFLARE_API_TOKEN is not set");
});

test("errors when cloudflareZoneId is missing from registry", async () => {
  createRegistry(tmpDir, { withZoneId: false });

  await expect(
    runSubdomainRegister(makeInput({ service: "matomo-proxy" }), makeContext(tmpDir)),
  ).rejects.toThrow("cloudflareZoneId");
});

test("errors when service is not found in registry", async () => {
  createRegistry(tmpDir);

  await expect(
    runSubdomainRegister(makeInput({ service: "nonexistent" }), makeContext(tmpDir)),
  ).rejects.toThrow("Service 'nonexistent' not found");
});

test("resolves <account> from workersDevUrl when CLOUDFLARE_ACCOUNT_ID is not set", async () => {
  createRegistry(tmpDir, { withWorkersDevUrl: true });
  delete process.env.CLOUDFLARE_ACCOUNT_ID;

  setupFetchMock({
    createDns: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: {
          id: "dns-new",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "matomo-proxy.myaccount.workers.dev",
          proxied: true,
        },
      }),
    createRoute: () =>
      mockResponse(true, 200, {
        success: true,
        errors: [],
        messages: [],
        result: {
          id: "route-new",
          pattern: "matomo-proxy.warpgogol.com/*",
          script: "matomo-proxy",
        },
      }),
  });

  const result = await runSubdomainRegister(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.dnsRecord.content).toBe("matomo-proxy.myaccount.workers.dev");
});

test("errors when <account> cannot be resolved from any source", async () => {
  createRegistry(tmpDir);
  delete process.env.CLOUDFLARE_ACCOUNT_ID;

  await expect(
    runSubdomainRegister(makeInput({ service: "matomo-proxy" }), makeContext(tmpDir)),
  ).rejects.toThrow("Cannot resolve <account> subdomain");
});
