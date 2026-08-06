/*
<MODULE_CONTRACT>
  <purpose>RFC-0700: tests for leitstand.dev-deploy --release flag (deploy from release directory without open mission).</purpose>
  <keywords>RFC-0700, leitstand, dev-deploy, release, no-mission, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0700: add tests for --release path — success, system mismatch, release not found, dist missing, no currentMission required, workpiece path unchanged.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandDevDeploy } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "3.99.0", ""),
  execSync: vi.fn((cmd: string) => {
    if (cmd === "git rev-parse HEAD") return "abc123def456\n";
    return "";
  }),
}));

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

function createRegistryWithChannels(
  workspaceRoot: string,
  systemId: string,
  options?: {
    currentMission?: string;
  },
): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });

  const missionField = options?.currentMission ?? "null";

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

function createDistDir(workspaceRoot: string, releaseId: string): string {
  const distDir = join(workspaceRoot, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Hello</body></html>");
  return distDir;
}

function createWorkpieceDist(workspaceRoot: string, missionId: string): string {
  const workpieceDir = join(workspaceRoot, "missions", missionId, "workpiece");
  const distDir = join(workpieceDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Workpiece</body></html>");
  return distDir;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0700-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// --- RFC-0700: --release path tests ---

test("RFC-0700: --release deploys from releases/<id>/dist/ and returns success", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    missionId,
    commitSha: "abc123def456",
    state: "ready",
    distTreeHash: "sha256:abc",
  });
  createDistDir(tmpDir, releaseId);

  const result = await runLeitstandDevDeploy(
    makeInput({ site: systemId, release: releaseId }),
    makeContext(tmpDir),
  );

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.command).toBe("leitstand.dev-deploy");
  expect(data?.systemId).toBe(systemId);
  expect(data?.missionId).toBe(missionId);
  expect(data?.commitSha).toBe("abc123def456");
  expect(data?.buildState).toBe("succeeded");
  expect(data?.buildSkipped).toBe(true);
  expect(data?.deployState).toBe("succeeded");
  expect(data?.releaseDeployed).toBe(releaseId);
  expect(data?.evidenceSynced).toBe(false);
  expect(data?.evidenceSyncError).toBe(null);

  const axiom = data?.axiom as Record<string, unknown>;
  expect(axiom?.status).toBe("not-run");

  const buildIdentity = data?.buildIdentity as Record<string, unknown>;
  expect(buildIdentity?.written).toBe(false);
}, 15_000);

test("RFC-0700: --release succeeds without currentMission (no open mission required)", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  // No currentMission set — registry has currentMission: null
  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    missionId,
    commitSha: "abc123def456",
    state: "ready",
    distTreeHash: "sha256:abc",
  });
  createDistDir(tmpDir, releaseId);

  const result = await runLeitstandDevDeploy(
    makeInput({ site: systemId, release: releaseId }),
    makeContext(tmpDir),
  );

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.deployState).toBe("succeeded");
  expect(data?.releaseDeployed).toBe(releaseId);
}, 15_000);

test("RFC-0700: --release with system mismatch returns exitCode 1", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "other-sys",
    missionId,
    commitSha: "abc123def456",
    state: "ready",
    distTreeHash: "sha256:abc",
  });
  createDistDir(tmpDir, releaseId);

  const result = await runLeitstandDevDeploy(
    makeInput({ site: systemId, release: releaseId }),
    makeContext(tmpDir),
  );

  expect(result.exitCode).toBe(1);
  expect(result.summary).toContain("does not belong to system");
}, 15_000);

test("RFC-0700: --release not found throws error", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });

  await expect(
    runLeitstandDevDeploy(
      makeInput({ site: systemId, release: "nonexistent-r000001" }),
      makeContext(tmpDir),
    ),
  ).rejects.toThrow("release 'nonexistent-r000001' not found");
}, 15_000);

test("RFC-0700: --release with missing dist throws error", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    missionId,
    commitSha: "abc123def456",
    state: "ready",
    distTreeHash: "sha256:abc",
  });
  // No dist directory created

  await expect(
    runLeitstandDevDeploy(makeInput({ site: systemId, release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("no dist directory");
}, 15_000);

test("RFC-0700: without --release, workpiece path is unchanged (requires open mission)", async () => {
  const systemId = "test-sys";

  // No currentMission, no --release → should throw "no active mission"
  createRegistryWithChannels(tmpDir, systemId);

  await expect(
    runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir)),
  ).rejects.toThrow("no active mission");
}, 15_000);

test("RFC-0700: without --release, releaseDeployed is undefined in result", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  createWorkpieceDist(tmpDir, missionId);

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.releaseDeployed).toBeUndefined();
  expect(data?.buildSkipped).toBeDefined();
}, 15_000);

test("RFC-0700: --force-build warning is logged when --release is set", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    missionId,
    commitSha: "abc123def456",
    state: "ready",
    distTreeHash: "sha256:abc",
  });
  createDistDir(tmpDir, releaseId);

  const warnCalls: string[] = [];
  const context = {
    ...makeContext(tmpDir),
    logger: {
      ...makeContext(tmpDir).logger,
      warn: (msg: string) => warnCalls.push(msg),
    },
  } as unknown as KernelRuntimeContext;

  await runLeitstandDevDeploy(
    makeInput({ site: systemId, release: releaseId, "force-build": "true" }),
    context,
  );

  expect(warnCalls).toContain(
    "[leitstand.dev-deploy] --force-build ignored because --release is set",
  );
}, 15_000);
