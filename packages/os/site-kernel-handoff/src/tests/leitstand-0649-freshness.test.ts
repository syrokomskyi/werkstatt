/*
<MODULE_CONTRACT>
  <purpose>RFC-0649 / RFC-0657: tests for leitstand.dev-deploy freshness guarantee — null adapter skip, purge fatal, freshness mismatch, freshness verified, retry-then-success, all-attempts-fail.</purpose>
  <keywords>RFC-0649, RFC-0657, leitstand, dev-deploy, freshness, purge, null-adapter, cdn, retry, exponential-backoff, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0649: add tests for null adapter skip, cloudflare-workers purge fatal, freshness hash mismatch, freshness verified, --json output freshness field.</item>
  <item>RFC-0657: update hash mismatch test for 5-attempt retry; add retry-then-success, all-attempts-fail (HTTP 404), all-attempts-fail (hash mismatch), network-error-retried tests; use setTimeout stub for retry delay avoidance.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandDevDeploy } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";

// Mock child_process: execSync for pnpm build + git rev-parse; execFile for wrangler version;
// spawn for wrangler deploy — returns a fake child process that emits stdout, exit event.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => cb(null, "3.99.0", ""),
    execSync: vi.fn((cmd: string) => {
      if (cmd === "git rev-parse HEAD") return "abc123def456\n";
      if (cmd === "pnpm build") return "";
      return "";
    }),
    spawn: vi.fn(() => {
      const fakeChild = {
        stdout: { on: (_event: string, cb: (data: string) => void) => cb("") },
        stderr: { on: (_event: string, _cb: (data: string) => void) => {} },
        on: (event: string, cb: (code: number) => void) => {
          if (event === "exit") cb(0);
        },
        kill: () => {},
      };
      return fakeChild;
    }),
  };
});

vi.mock("@warpgogol/site-kernel", async (importOriginal) => {
  const original = await importOriginal<typeof import("@warpgogol/site-kernel")>();
  return {
    ...original,
    executeKernelCommand: vi.fn(async () => ({
      ok: true,
      exitCode: 0,
      data: { findings: { errors: 0, warnings: 0 } },
      summary: "mission.check: pass",
    })),
  };
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
  systemId: string,
  adapter: string,
  currentMission?: string,
): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });
  const missionField = currentMission ?? "null";
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: ${systemId}
    cosmicStar: Acamar
    mirrors:
      - path: /tmp/test-cache
        storageType: non-bare
    pinnedPlatform: 1.0.0
    currentMission: ${missionField}
    lastRelease: null
    status: active
    registeredAt: 2026-01-01T00:00:00.000Z
    notes: ""
    deployment:
      adapter: "${adapter}"
      channels:
        dev:
          workerName: test-dev
          url: https://dev.example.com
        alt:
          workerName: test-alt
          url: https://alt.example.com
        main:
          workerName: test-main
          url: https://main.example.com
`;
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

function createRegistryWithCloudflareAdapter(
  workspaceRoot: string,
  systemId: string,
  currentMission: string,
): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: ${systemId}
    cosmicStar: Acamar
    mirrors:
      - path: /tmp/test-cache
        storageType: non-bare
    pinnedPlatform: 1.0.0
    currentMission: ${currentMission}
    lastRelease: null
    status: active
    registeredAt: 2026-01-01T00:00:00.000Z
    notes: ""
    deployment:
      adapter: "cloudflare-workers"
      channels:
        dev:
          workerName: test-dev
          url: https://dev.example.com
        alt:
          workerName: test-alt
          url: https://alt.example.com
        main:
          workerName: test-main
          url: https://main.example.com
`;
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

function createWorkpieceDist(
  workspaceRoot: string,
  missionId: string,
  envAltContent?: string,
): string {
  const workpieceDir = join(workspaceRoot, "missions", missionId, "workpiece");
  const distDir = join(workpieceDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Workpiece</body></html>");
  if (envAltContent) {
    writeFileSync(join(workpieceDir, ".env.alt"), envAltContent);
  }
  return distDir;
}

let tmpDir: string;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0649-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_SECRETS_FILE;
  delete process.env.CLOUDFLARE_ZONE_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
});

// RFC-0657: Helper to make sleep() a no-op by stubbing setTimeout to fire immediately.
// This avoids real-time delays (45s total for 5 attempts) without interfering with
// other async operations the way vi.useFakeTimers() does.
function skipSleep(): void {
  vi.stubGlobal(
    "setTimeout",
    vi.fn((cb: () => void) => {
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }),
  );
}

// --- Null adapter tests ---

test("RFC-0649: null adapter skips purge and freshness check — Axiom runs normally", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistry(tmpDir, systemId, "null", missionId);
  createWorkpieceDist(tmpDir, missionId);

  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(axiom?.status).toBe("pass");
  expect(freshness?.verified).toBe(true);
  expect(freshness?.cdnDistTreeHash).toBe(null);
  // fetch should NOT have been called for freshness (null adapter skips it)
  expect(mockFetch).not.toHaveBeenCalled();
}, 15_000);

test("RFC-0649: cloudflare-workers adapter with missing CLOUDFLARE_ZONE_ID — fatal, Axiom not run", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithCloudflareAdapter(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  // No secrets file → no CLOUDFLARE_ZONE_ID → purge skips with warning → fatal
  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(1);
  expect(axiom?.status).toBe("not-run");
  expect(freshness?.verified).toBe(false);
  expect(freshness?.error).toContain("CDN purge failed");
}, 15_000);

test("RFC-0649: cloudflare-workers adapter with freshness hash mismatch — fatal, Axiom not run", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  // Write .env.alt with CLOUDFLARE_ZONE_ID so purge doesn't skip
  const envAltContent = "CLOUDFLARE_ZONE_ID=test-zone-id\nCLOUDFLARE_API_TOKEN=test-token\n";

  createRegistryWithCloudflareAdapter(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId, envAltContent);

  // Mock fetch: purge API returns success, build-identity returns mismatched hash on all attempts
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes("purge_cache")) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    if (url.includes("build-identity.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ distTreeHash: "sha256:STALE_HASH" }),
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });

  // RFC-0657: Stub setTimeout to make sleep() a no-op (avoids 45s of real backoff delays)
  skipSleep();
  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(1);
  expect(axiom?.status).toBe("not-run");
  expect(freshness?.verified).toBe(false);
  expect(freshness?.error).toContain("distTreeHash mismatch");
  expect(freshness?.cdnDistTreeHash).toBe("sha256:STALE_HASH");
  // RFC-0657: verifyFreshness should have been called 5 times (all attempts failed)
  expect(freshness?.attempts).toBe(5);
}, 15_000);

test("RFC-0649: cloudflare-workers adapter with freshness verified — normal flow, Axiom runs", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  // Write .env.alt
  const envAltContent = "CLOUDFLARE_ZONE_ID=test-zone-id\nCLOUDFLARE_API_TOKEN=test-token\n";

  createRegistryWithCloudflareAdapter(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId, envAltContent);

  // Mock fetch: purge API returns success, build-identity returns matching hash.
  // The local distTreeHash is computed by fingerprintTree from the dist directory.
  // We read the local build-identity.json to get the real hash and return it from the CDN.
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes("purge_cache")) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    if (url.includes("build-identity.json")) {
      const fs = await import("node:fs/promises");
      const localPath = join(
        tmpDir,
        "missions",
        missionId,
        "workpiece",
        "dist",
        "client",
        ".well-known",
        "build-identity.json",
      );
      try {
        const localContent = await fs.readFile(localPath, "utf-8");
        const localJson = JSON.parse(localContent);
        return {
          ok: true,
          status: 200,
          json: async () => ({ distTreeHash: localJson.distTreeHash }),
        } as Response;
      } catch {
        return { ok: false, status: 404 } as Response;
      }
    }
    return { ok: false, status: 404 } as Response;
  });

  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(0);
  expect(axiom?.status).toBe("pass");
  expect(freshness?.verified).toBe(true);
}, 20_000);

test("RFC-0649: --json output includes freshness object with required fields", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistry(tmpDir, systemId, "null", missionId);
  createWorkpieceDist(tmpDir, missionId);

  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(freshness).toBeDefined();
  expect(freshness).toHaveProperty("verified");
  expect(freshness).toHaveProperty("cdnDistTreeHash");
  expect(freshness).toHaveProperty("localDistTreeHash");
  expect(freshness).toHaveProperty("attempts");
}, 15_000);

// --- RFC-0657 retry tests ---

test("RFC-0657: retry-then-success — first attempt stale, second attempt fresh", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  const envAltContent = "CLOUDFLARE_ZONE_ID=test-zone-id\nCLOUDFLARE_API_TOKEN=test-token\n";

  createRegistryWithCloudflareAdapter(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId, envAltContent);

  // Mock fetch: purge API returns success.
  // build-identity.json: first call returns stale hash, second call returns fresh hash.
  let buildIdentityCallCount = 0;
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes("purge_cache")) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    if (url.includes("build-identity.json")) {
      buildIdentityCallCount++;
      if (buildIdentityCallCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ distTreeHash: "sha256:STALE_HASH" }),
        } as Response;
      }
      // Second call: return the real local hash
      const fs = await import("node:fs/promises");
      const localPath = join(
        tmpDir,
        "missions",
        missionId,
        "workpiece",
        "dist",
        "client",
        ".well-known",
        "build-identity.json",
      );
      try {
        const localContent = await fs.readFile(localPath, "utf-8");
        const localJson = JSON.parse(localContent);
        return {
          ok: true,
          status: 200,
          json: async () => ({ distTreeHash: localJson.distTreeHash }),
        } as Response;
      } catch {
        return { ok: false, status: 404 } as Response;
      }
    }
    return { ok: false, status: 404 } as Response;
  });

  skipSleep();
  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(0);
  expect(axiom?.status).toBe("pass");
  expect(freshness?.verified).toBe(true);
  expect(freshness?.attempts).toBe(2);
}, 15_000);

test("RFC-0657: all-attempts-fail with HTTP 404 — exit 1, Axiom not run", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  const envAltContent = "CLOUDFLARE_ZONE_ID=test-zone-id\nCLOUDFLARE_API_TOKEN=test-token\n";

  createRegistryWithCloudflareAdapter(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId, envAltContent);

  // Mock fetch: purge API returns success, build-identity returns 404 on all attempts
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes("purge_cache")) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });

  skipSleep();
  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(1);
  expect(axiom?.status).toBe("not-run");
  expect(freshness?.verified).toBe(false);
  expect(freshness?.attempts).toBe(5);
  expect(freshness?.error).toContain("HTTP 404");
}, 15_000);

test("RFC-0657: network error retried — first attempt throws, second succeeds", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  const envAltContent = "CLOUDFLARE_ZONE_ID=test-zone-id\nCLOUDFLARE_API_TOKEN=test-token\n";

  createRegistryWithCloudflareAdapter(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId, envAltContent);

  // Mock fetch: purge API returns success.
  // build-identity.json: first call throws (network error), second call returns fresh hash.
  let buildIdentityCallCount = 0;
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes("purge_cache")) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    if (url.includes("build-identity.json")) {
      buildIdentityCallCount++;
      if (buildIdentityCallCount === 1) {
        throw new Error("ECONNREFUSED");
      }
      const fs = await import("node:fs/promises");
      const localPath = join(
        tmpDir,
        "missions",
        missionId,
        "workpiece",
        "dist",
        "client",
        ".well-known",
        "build-identity.json",
      );
      try {
        const localContent = await fs.readFile(localPath, "utf-8");
        const localJson = JSON.parse(localContent);
        return {
          ok: true,
          status: 200,
          json: async () => ({ distTreeHash: localJson.distTreeHash }),
        } as Response;
      } catch {
        return { ok: false, status: 404 } as Response;
      }
    }
    return { ok: false, status: 404 } as Response;
  });

  skipSleep();
  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  const axiom = data?.axiom as Record<string, unknown> | undefined;
  const freshness = axiom?.freshness as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(0);
  expect(axiom?.status).toBe("pass");
  expect(freshness?.verified).toBe(true);
  expect(freshness?.attempts).toBe(2);
}, 15_000);
