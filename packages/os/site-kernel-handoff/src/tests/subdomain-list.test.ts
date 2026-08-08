/*
<MODULE_CONTRACT>
<purpose>RFC-0752: tests for subdomain.list command handler — cross-referencing DNS records with Workers routes, empty zone, route without DNS.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0752: initial subdomain.list tests.</item>
  <item>ADR-0035: refactored to use shared cloudflare-api-mock helper (setupCloudflareApiMock).</item>
  <item>ADR-0036: refactored to use shared registry-builder helper (buildRegistry).</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSubdomainList } from "../subdomain/subdomain-list.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";
import {
  setupCloudflareApiMock,
  dnsListResponse,
  routeListResponse,
} from "./helpers/cloudflare-api-mock.ts";
import { buildRegistry } from "./helpers/registry-builder.ts";

let tmpDir: string;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-subdomain-list-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_API_TOKEN;
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
  const registryContent = buildRegistry({
    systems: [
      {
        id: "warpgogol-com",
        cosmicStar: "Vega",
        mirrors: [{ path: "/tmp/test-cache", storageType: "non-bare" }],
        pinnedPlatform: "1.0.0",
        notes: "",
        cloudflareZoneId: "zone-123",
        deployment: {
          adapter: "cloudflare-workers",
          channels: {
            dev: { workerName: "wg-dev", url: "https://dev.warpgogol.com" },
            alt: { workerName: "wg-alt", url: "https://alt.warpgogol.com" },
            main: { workerName: "wg-main", url: "https://warpgogol.com" },
          },
        },
      },
    ],
  });
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

test("cross-references DNS records with Workers routes", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () =>
      dnsListResponse([
        {
          id: "dns-1",
          type: "CNAME",
          name: "matomo-proxy.warpgogol.com",
          content: "matomo-proxy.account.workers.dev",
          proxied: true,
        },
        {
          id: "dns-2",
          type: "A",
          name: "dev.warpgogol.com",
          content: "1.2.3.4",
          proxied: false,
        },
      ]),
    routeList: () =>
      routeListResponse([
        {
          id: "route-1",
          pattern: "matomo-proxy.warpgogol.com/*",
          script: "matomo-proxy",
        },
      ]),
  });

  const result = await runSubdomainList(makeInput({ zone: "warpgogol.com" }), makeContext(tmpDir));

  expect(result.data!.zone).toBe("warpgogol.com");
  expect(result.data!.subdomains).toHaveLength(2);

  const matomo = result.data!.subdomains.find((s) => s.domain === "matomo-proxy.warpgogol.com");
  expect(matomo).toBeDefined();
  expect(matomo!.dnsRecord.exists).toBe(true);
  expect(matomo!.workersRoute.exists).toBe(true);
  expect(matomo!.workersRoute.script).toBe("matomo-proxy");

  const dev = result.data!.subdomains.find((s) => s.domain === "dev.warpgogol.com");
  expect(dev).toBeDefined();
  expect(dev!.dnsRecord.exists).toBe(true);
  expect(dev!.workersRoute.exists).toBe(false);
});

test("includes routes without DNS records", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () => dnsListResponse([]),
    routeList: () =>
      routeListResponse([
        {
          id: "route-orphan",
          pattern: "orphan.warpgogol.com/*",
          script: "orphan-worker",
        },
      ]),
  });

  const result = await runSubdomainList(makeInput({ zone: "warpgogol.com" }), makeContext(tmpDir));

  expect(result.data!.subdomains).toHaveLength(1);
  expect(result.data!.subdomains[0].domain).toBe("orphan.warpgogol.com");
  expect(result.data!.subdomains[0].dnsRecord.exists).toBe(false);
  expect(result.data!.subdomains[0].workersRoute.exists).toBe(true);
});

test("returns empty list for zone with no records", async () => {
  createRegistry(tmpDir);

  setupCloudflareApiMock(mockFetch, {
    dnsList: () => dnsListResponse([]),
    routeList: () => routeListResponse([]),
  });

  const result = await runSubdomainList(makeInput({ zone: "warpgogol.com" }), makeContext(tmpDir));

  expect(result.data!.subdomains).toHaveLength(0);
});

test("errors when CLOUDFLARE_API_TOKEN is missing", async () => {
  createRegistry(tmpDir);
  delete process.env.CLOUDFLARE_API_TOKEN;

  await expect(
    runSubdomainList(makeInput({ zone: "warpgogol.com" }), makeContext(tmpDir)),
  ).rejects.toThrow("CLOUDFLARE_API_TOKEN is not set");
});

test("errors when --zone is missing", async () => {
  createRegistry(tmpDir);

  await expect(runSubdomainList(makeInput({}), makeContext(tmpDir))).rejects.toThrow(
    "--zone is required",
  );
});
