/*
<MODULE_CONTRACT>
  <purpose>RFC-0608: tests for leitstand.promote — state gate, build-identity verification, hash mismatch, and success path.</purpose>
  <keywords>RFC-0608, leitstand, promote, build-identity, verification, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0608: add tests for leitstand.promote state gate, build-identity fetch/verify, hash mismatch, and success.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandPromote } from "../leitstand/leitstand-commands.ts";
import { storeArtifactCore } from "../artifact-store/artifact-store-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "3.99.0", ""),
}));

vi.mock("../leitstand/adapters/cloudflare-workers.ts", () => ({
  createCloudflareWorkersAdapter: () => ({
    name: "cloudflare-workers",
    async propagate(input: { systemId: string; releaseId: string; url: string }) {
      const now = new Date().toISOString();
      return {
        systemId: input.systemId,
        releaseId: input.releaseId,
        state: "succeeded",
        deploymentUrl: input.url,
        startedAt: now,
        completedAt: now,
        healthChecks: [],
      };
    },
    async rollback(input: { systemId: string; toReleaseId: string; url: string }) {
      const now = new Date().toISOString();
      return {
        systemId: input.systemId,
        releaseId: input.toReleaseId,
        state: "succeeded",
        deploymentUrl: input.url,
        startedAt: now,
        completedAt: now,
        healthChecks: [],
      };
    },
    async health() {
      return { state: "healthy" as const, checks: [] };
    },
    getLimits() {
      return { maxTotalSize: 20 * 1024 * 1024 * 1024, maxFileSize: 25 * 1024 * 1024 };
    },
  }),
  filterEnv: (env: Record<string, string | undefined>) => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) result[key] = value;
    }
    return result;
  },
  sourceDotenv: () => ({}),
  readBehaviorSnapshot: () => null,
}));

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

function writeReleaseManifest(
  workspaceRoot: string,
  releaseId: string,
  fields: Record<string, unknown>,
): void {
  const releaseDir = join(workspaceRoot, "releases", releaseId);
  mkdirSync(releaseDir, { recursive: true });
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) {
      lines.push(`${key}: null`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "boolean" || typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  writeFileSync(join(releaseDir, "release.yaml"), lines.join("\n") + "\n");
}

function readReleaseState(workspaceRoot: string, releaseId: string): string {
  const content = readFileSync(join(workspaceRoot, "releases", releaseId, "release.yaml"), "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^state:\s*(.*)$/);
    if (match) return match[1];
  }
  return "";
}

function createRegistry(workspaceRoot: string, systemId: string): void {
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
    currentMission: null
    lastRelease: null
    status: active
    registeredAt: 2026-01-01T00:00:00.000Z
    notes: ""
    deployment:
      adapter: "null"
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

function createRegistryWithCloudflareAdapter(workspaceRoot: string, systemId: string): void {
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
    currentMission: null
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

function createBehaviorSnapshot(workspaceRoot: string, releaseId: string): void {
  const snapshotPath = join(workspaceRoot, "releases", releaseId, "behavior-snapshot.json");
  const snapshot = {
    schemaVersion: "1.0.0",
    releaseId,
    capturedAt: "2026-01-01T00:00:00.000Z",
    routes: [{ path: "/", contentHash: null }],
  };
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
}

function createDistDir(workspaceRoot: string, releaseId: string): string {
  const distDir = join(workspaceRoot, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Hello</body></html>");
  return distDir;
}

const VALID_BUILD_IDENTITY = {
  releaseId: "test-sys-r000001",
  systemId: "test-sys",
  missionId: "test-sys-m000001",
  semver: "1.0.0",
  distTreeHash: "dist-hash-123",
  behaviorSnapshotHash: "behavior-hash-123",
  siteContentHash: "content-hash-123",
  platformVersion: "1.0.0",
  platformSemanticHash: "platform-hash-123",
  commitSha: "abc123",
  buildTimestamp: "2026-01-01T00:00:00.000Z",
  targetPlatform: "cloudflare-workers",
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0608-promo-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

test("leitstand.promote rejects when release state is not alt-deployed", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "published",
    missionId: "test-sys-m000001",
  });

  await expect(
    runLeitstandPromote(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("must be in state 'alt-deployed'");
});

test("leitstand.promote rejects when build-identity.json is not found at alt URL", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "alt-deployed",
    missionId: "test-sys-m000001",
    distTreeHash: "dist-hash-123",
    behaviorSnapshotHash: "behavior-hash-123",
    siteContentHash: "content-hash-123",
  });
  createDistDir(tmpDir, releaseId);
  await storeArtifactCore(tmpDir, releaseId, join(tmpDir, "releases", releaseId, "dist"), systemId);

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

  await expect(
    runLeitstandPromote(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("build-identity.json not found at alt URL");
});

test("leitstand.promote rejects on hash mismatch", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "alt-deployed",
    missionId: "test-sys-m000001",
    distTreeHash: "dist-hash-123",
    behaviorSnapshotHash: "behavior-hash-123",
    siteContentHash: "content-hash-123",
  });
  createDistDir(tmpDir, releaseId);

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...VALID_BUILD_IDENTITY, distTreeHash: "WRONG-hash" }),
    }),
  );

  await expect(
    runLeitstandPromote(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("build-identity mismatch for 'distTreeHash'");
});

test("leitstand.promote rejects on releaseId mismatch", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "alt-deployed",
    missionId: "test-sys-m000001",
    distTreeHash: "dist-hash-123",
    behaviorSnapshotHash: "behavior-hash-123",
    siteContentHash: "content-hash-123",
  });
  createDistDir(tmpDir, releaseId);

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...VALID_BUILD_IDENTITY, releaseId: "test-sys-r000099" }),
    }),
  );

  await expect(
    runLeitstandPromote(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("build-identity mismatch for 'releaseId'");
});

test("leitstand.promote succeeds and transitions to promoted when all checks pass", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistryWithCloudflareAdapter(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "alt-deployed",
    missionId: "test-sys-m000001",
    distTreeHash: "dist-hash-123",
    behaviorSnapshotHash: "behavior-hash-123",
    siteContentHash: "content-hash-123",
  });
  createDistDir(tmpDir, releaseId);
  await storeArtifactCore(tmpDir, releaseId, join(tmpDir, "releases", releaseId, "dist"), systemId);

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_BUILD_IDENTITY,
      text: async () => JSON.stringify(VALID_BUILD_IDENTITY),
      headers: new Headers(),
    }),
  );

  const result = await runLeitstandPromote(makeInput({ release: releaseId }), makeContext(tmpDir));

  expect(result.data!.state).toBe("succeeded");
  expect(result.data!.channel).toBe("main");
  expect(result.data!.buildIdentityVerified).toBe(true);
  expect(result.data!.releaseState).toBe("promoted");
  expect(readReleaseState(tmpDir, releaseId)).toBe("promoted");
});

test("RFC-0618: build-identity fetch URL includes cache-buster query param", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistryWithCloudflareAdapter(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "alt-deployed",
    missionId: "test-sys-m000001",
    distTreeHash: "dist-hash-123",
    behaviorSnapshotHash: "behavior-hash-123",
    siteContentHash: "content-hash-123",
  });
  createDistDir(tmpDir, releaseId);
  await storeArtifactCore(tmpDir, releaseId, join(tmpDir, "releases", releaseId, "dist"), systemId);

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => VALID_BUILD_IDENTITY,
    text: async () => JSON.stringify(VALID_BUILD_IDENTITY),
    headers: new Headers(),
  });
  vi.stubGlobal("fetch", mockFetch);

  await runLeitstandPromote(makeInput({ release: releaseId }), makeContext(tmpDir));

  const buildIdentityCall = mockFetch.mock.calls[0];
  const fetchUrl = buildIdentityCall[0] as string;
  expect(fetchUrl).toMatch(/\.well-known\/build-identity\.json\?cb=\d+$/);
});
