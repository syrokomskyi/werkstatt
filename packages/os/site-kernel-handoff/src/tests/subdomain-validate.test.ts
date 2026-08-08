/*
<MODULE_CONTRACT>
<purpose>RFC-0752: tests for subdomain.validate command handler — valid, not-registered, mismatched states.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0752: initial subdomain.validate tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSubdomainValidate } from "../subdomain/subdomain-validate.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";
import {
  setupCloudflareApiMock,
  dnsListResponse,
  routeListResponse,
} from "./helpers/cloudflare-api-mock.ts";

let tmpDir: string;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-subdomain-validate-"));
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

function createRegistry(workspaceRoot: string): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });
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
    cloudflareZoneId: zone-123
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
          url: https://warpgogol.com
services:
  - id: matomo-proxy
    kind: proxy-worker
    workerName: matomo-proxy
    hostedBy: studio
    url: https://matomo-proxy.warpgogol.com
    subdomains:
      - domain: matomo-proxy.warpgogol.com
        zone: warpgogol.com
`;
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

test("reports valid when both DNS and route exist and are correct", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () =>
      dnsListResponse([
        {
          id: "dns-ok",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "matomo-proxy.test-account.workers.dev",
          proxied: true,
        },
      ]),
    routeList: () =>
      routeListResponse([
        {
          id: "route-ok",
          pattern: "matomo-proxy.warpgogol.com/*",
          script: "matomo-proxy",
        },
      ]),
  });

  const result = await runSubdomainValidate(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("valid");
  expect(result.data!.dnsRecord.correct).toBe(true);
  expect(result.data!.workersRoute.correct).toBe(true);
});

test("reports not-registered when both DNS and route are missing", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () => dnsListResponse([]),
    routeList: () => routeListResponse([]),
  });

  const result = await runSubdomainValidate(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("not-registered");
  expect(result.data!.dnsRecord.exists).toBe(false);
  expect(result.data!.workersRoute.exists).toBe(false);
});

test("reports mismatched when DNS has wrong target", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () =>
      dnsListResponse([
        {
          id: "dns-wrong",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "wrong-target.workers.dev",
          proxied: true,
        },
      ]),
    routeList: () =>
      routeListResponse([
        {
          id: "route-ok",
          pattern: "matomo-proxy.warpgogol.com/*",
          script: "matomo-proxy",
        },
      ]),
  });

  const result = await runSubdomainValidate(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("mismatched");
  expect(result.data!.dnsRecord.correct).toBe(false);
  expect(result.data!.dnsRecord.exists).toBe(true);
});

test("reports mismatched when Workers route has wrong script", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () =>
      dnsListResponse([
        {
          id: "dns-ok",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "matomo-proxy.test-account.workers.dev",
          proxied: true,
        },
      ]),
    routeList: () =>
      routeListResponse([
        {
          id: "route-wrong",
          pattern: "matomo-proxy.warpgogol.com/*",
          script: "wrong-worker",
        },
      ]),
  });

  const result = await runSubdomainValidate(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("mismatched");
  expect(result.data!.workersRoute.correct).toBe(false);
  expect(result.data!.workersRoute.exists).toBe(true);
});

test("reports not-registered when DNS exists but route is missing", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () =>
      dnsListResponse([
        {
          id: "dns-ok",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "matomo-proxy.test-account.workers.dev",
          proxied: true,
        },
      ]),
    routeList: () => routeListResponse([]),
  });

  const result = await runSubdomainValidate(
    makeInput({ service: "matomo-proxy" }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("mismatched");
  expect(result.data!.dnsRecord.exists).toBe(true);
  expect(result.data!.workersRoute.exists).toBe(false);
});

test("errors when CLOUDFLARE_API_TOKEN is missing", async () => {
  createRegistry(tmpDir);
  delete process.env.CLOUDFLARE_API_TOKEN;

  await expect(
    runSubdomainValidate(makeInput({ service: "matomo-proxy" }), makeContext(tmpDir)),
  ).rejects.toThrow("CLOUDFLARE_API_TOKEN is not set");
});
