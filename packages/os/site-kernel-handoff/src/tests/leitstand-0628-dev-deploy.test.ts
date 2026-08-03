/*
<MODULE_CONTRACT>
  <purpose>RFC-0628: tests for leitstand.dev-deploy (workpiece-based), propagate Axiom gate (published + commitSha + missionId), and rollback auto-detect/auto-step (no dev-deployed).</purpose>
  <keywords>RFC-0628, leitstand, dev-deploy, workpiece, axiom-gate, commitSha, rollback, state-machine, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0628: replace leitstand.deploy tests with leitstand.dev-deploy tests; update propagate gate tests (published + commitSha + missionId); update rollback auto-step tests (remove dev-deployed).</item>
  <item>RFC-0634: add package.json to temp workspace for computeBuildInputHash compatibility.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  runLeitstandDevDeploy,
  runLeitstandPropagate,
  runLeitstandRollback,
} from "../leitstand/leitstand-commands.ts";
import { storeArtifactCore } from "../artifact-store/artifact-store-commands.ts";
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

function readReleaseState(workspaceRoot: string, releaseId: string): string {
  const content = readFileSync(join(workspaceRoot, "releases", releaseId, "release.yaml"), "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^state:\s*(.*)$/);
    if (match) return match[1];
  }
  return "";
}

function createRegistryWithChannels(
  workspaceRoot: string,
  systemId: string,
  options?: {
    currentMission?: string;
    lastPropagated?: Record<string, { releaseId: string; state: string; healthy: boolean }>;
  },
): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });

  const lpEntries: string[] = [];
  if (options?.lastPropagated) {
    for (const [ch, info] of Object.entries(options.lastPropagated)) {
      lpEntries.push(`        ${ch}:
          releaseId: ${info.releaseId}
          at: 2026-01-01T00:00:00.000Z
          healthy: ${info.healthy}
          state: ${info.state}
          operationId: op-123
          leaseExpiresAt: null`);
    }
  }

  const lpSection = lpEntries.length > 0 ? `\n      lastPropagated:\n${lpEntries.join("\n")}` : "";

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
          url: https://main.example.com${lpSection}
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

function writeStudyRun(
  workspaceRoot: string,
  missionId: string,
  findings: Array<{ severity: string; extension?: Record<string, unknown> }>,
): void {
  const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "study-run.json"), JSON.stringify({ findings }, null, 2) + "\n");
}

function writeEvidenceMetadata(
  workspaceRoot: string,
  missionId: string,
  options?: {
    commitSha?: string;
    metadataMissionId?: string;
    methodologies?: Array<{ id: string; digest?: string; blockOn?: string[] }>;
  },
): void {
  const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
  mkdirSync(evidenceDir, { recursive: true });
  const metadata: Record<string, unknown> = {
    missionId: options?.metadataMissionId ?? missionId,
    methodologies: options?.methodologies ?? [
      { id: "automated-web-accessibility", digest: "sha256:mock", blockOn: ["high", "critical"] },
    ],
  };
  if (options?.commitSha) {
    metadata.commitSha = options.commitSha;
  }
  writeFileSync(
    join(evidenceDir, "evidence-metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0628-"));
  // RFC-0634: computeBuildInputHash calls resolveCurrentEcosystem which reads workspaceRoot/package.json
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// --- leitstand.dev-deploy tests ---

test("leitstand.dev-deploy deploys workpiece to dev channel and returns success", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  createWorkpieceDist(tmpDir, missionId);

  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.command).toBe("leitstand.dev-deploy");
  expect(data?.systemId).toBe(systemId);
  expect(data?.missionId).toBe(missionId);
  expect(data?.deployState).toBe("succeeded");
  expect(data?.commitSha).toBe("abc123def456");
  expect(data?.buildState).toBe("succeeded");
}, 15_000);

test("leitstand.dev-deploy rejects when system has no active mission", async () => {
  const systemId = "test-sys";

  createRegistryWithChannels(tmpDir, systemId);

  await expect(
    runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir)),
  ).rejects.toThrow("no active mission");
});

test("leitstand.dev-deploy rejects when --system is missing", async () => {
  await expect(runLeitstandDevDeploy(makeInput({}), makeContext(tmpDir))).rejects.toThrow(
    "--system is required",
  );
});

test("leitstand.dev-deploy does not write to registry or bordbuch", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  createWorkpieceDist(tmpDir, missionId);

  await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  // Verify registry was not modified — no lastPropagated.dev entry
  const registryContent = readFileSync(join(tmpDir, "systems", "registry.yaml"), "utf8");
  expect(registryContent).not.toContain("lastPropagated");

  // Verify no bordbuch directory was created
  const bordbuchDir = join(tmpDir, "systems", systemId, "bordbuch");
  expect(existsSync(bordbuchDir)).toBe(false);
}, 15_000);

// --- RFC-0653: build-skip cache tests ---

test("RFC-0653: leitstand.dev-deploy writes build-skip cache after successful build", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  createWorkpieceDist(tmpDir, missionId);

  await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  const cachePath = join(tmpDir, "missions", missionId, ".dev-deploy-build-cache.json");
  expect(existsSync(cachePath)).toBe(true);
  const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
  expect(cache.commitSha).toBe("abc123def456");
  expect(cache.platformVersion).toBeDefined();
  expect(cache.platformSemanticHash).toBeDefined();
}, 15_000);

test("RFC-0653: leitstand.dev-deploy skips build on cache hit", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  createWorkpieceDist(tmpDir, missionId);

  // First run — writes cache
  await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  // Second run — should skip build
  const result = await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.buildSkipped).toBe(true);
  expect(data?.buildState).toBe("succeeded");
}, 15_000);

test("RFC-0653: leitstand.dev-deploy --force-build bypasses cache", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, { currentMission: missionId });
  createWorkpieceDist(tmpDir, missionId);

  // First run — writes cache
  await runLeitstandDevDeploy(makeInput({ system: systemId }), makeContext(tmpDir));

  // Second run with --force-build — should NOT skip
  const result = await runLeitstandDevDeploy(
    makeInput({ system: systemId, "force-build": "true" }),
    makeContext(tmpDir),
  );
  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.buildSkipped).toBe(false);
  expect(data?.buildState).toBe("succeeded");
}, 15_000);

// --- leitstand.propagate Axiom gate tests (RFC-0628: published + commitSha + missionId) ---

test("leitstand.propagate rejects release not in published state", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId: "test-sys-m000001",
    state: "alt-deployed",
  });

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("must be in state 'published'");
});

test("leitstand.propagate rejects when no evidence metadata exists", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "published",
    commitSha: "abc123def456",
  });

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("no Axiom evidence found");
});

test("leitstand.propagate rejects when evidence commitSha does not match release", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "published",
    commitSha: "release-sha-999",
  });
  writeEvidenceMetadata(tmpDir, missionId, { commitSha: "capsule-sha-111" });
  writeStudyRun(tmpDir, missionId, []);

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(
    "evidence commitSha 'capsule-sha-111' does not match release commitSha 'release-sha-999'",
  );
});

test("leitstand.propagate rejects when evidence missionId does not match release", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "published",
    commitSha: "abc123def456",
  });
  writeEvidenceMetadata(tmpDir, missionId, {
    commitSha: "abc123def456",
    metadataMissionId: "other-mission-m000999",
  });
  writeStudyRun(tmpDir, missionId, []);

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(
    "evidence missionId 'other-mission-m000999' does not match release missionId 'test-sys-m000001'",
  );
});

test("leitstand.propagate rejects when Axiom evidence has high/critical violations", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "published",
    commitSha: "abc123def456",
  });
  writeEvidenceMetadata(tmpDir, missionId, { commitSha: "abc123def456" });
  writeStudyRun(tmpDir, missionId, [
    {
      severity: "high",
      extension: {
        "automated-web-accessibility": { predicate: "accessibility.axe.violation" },
      },
    },
    {
      severity: "critical",
      extension: {
        "automated-web-accessibility": { predicate: "accessibility.axe.violation" },
      },
    },
    { severity: "low" },
  ]);

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(
    "Axiom verification failed: methodology 'automated-web-accessibility' has 2 block-on violation(s)",
  );
});

test("leitstand.propagate passes when Axiom evidence has only incomplete findings", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "published",
    commitSha: "abc123def456",
  });
  writeEvidenceMetadata(tmpDir, missionId, { commitSha: "abc123def456" });
  writeStudyRun(tmpDir, missionId, [
    {
      severity: "high",
      extension: {
        "automated-web-accessibility": { predicate: "accessibility.axe.incomplete" },
      },
    },
    {
      severity: "critical",
      extension: {
        "automated-web-accessibility": { predicate: "accessibility.axe.incomplete" },
      },
    },
  ]);

  // Should NOT throw "Axiom verification failed" — incomplete findings are tool limitations.
  // It will fail at a later step (no dist directory), but the Axiom gate itself passes.
  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.not.toThrow("Axiom verification failed");
});

// --- leitstand.rollback auto-detect tests (RFC-0628: no dev-deployed) ---

test("leitstand.rollback auto-detects main channel from promoted state", async () => {
  const systemId = "test-sys";
  const currentRelease = "test-sys-r000002";
  const targetRelease = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId, {
    lastPropagated: {
      main: { releaseId: currentRelease, state: "succeeded", healthy: true },
    },
  });
  writeReleaseManifest(tmpDir, currentRelease, {
    schemaVersion: "1.0.0",
    releaseId: currentRelease,
    systemId,
    missionId: "test-sys-m000001",
    state: "promoted",
  });
  writeReleaseManifest(tmpDir, targetRelease, {
    schemaVersion: "1.0.0",
    releaseId: targetRelease,
    systemId,
    missionId: "test-sys-m000001",
    state: "published",
  });
  const distDir = createDistDir(tmpDir, targetRelease);
  await storeArtifactCore(tmpDir, targetRelease, distDir, systemId);

  const result = await runLeitstandRollback(
    makeInput({ system: systemId, "to-release": targetRelease }),
    makeContext(tmpDir),
  );

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.state).toBe("succeeded");
  expect(data?.channel).toBe("main");
  expect(data?.releaseState).toBe("alt-deployed");
  expect(readReleaseState(tmpDir, currentRelease)).toBe("alt-deployed");
});

test("leitstand.rollback auto-detects alt channel and steps to published", async () => {
  const systemId = "test-sys";
  const currentRelease = "test-sys-r000002";
  const targetRelease = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId, {
    lastPropagated: {
      alt: { releaseId: currentRelease, state: "succeeded", healthy: true },
    },
  });
  writeReleaseManifest(tmpDir, currentRelease, {
    schemaVersion: "1.0.0",
    releaseId: currentRelease,
    systemId,
    missionId: "test-sys-m000001",
    state: "alt-deployed",
  });
  writeReleaseManifest(tmpDir, targetRelease, {
    schemaVersion: "1.0.0",
    releaseId: targetRelease,
    systemId,
    missionId: "test-sys-m000001",
    state: "published",
  });
  const distDir = createDistDir(tmpDir, targetRelease);
  await storeArtifactCore(tmpDir, targetRelease, distDir, systemId);

  const result = await runLeitstandRollback(
    makeInput({ system: systemId, "to-release": targetRelease }),
    makeContext(tmpDir),
  );

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.state).toBe("succeeded");
  expect(data?.channel).toBe("alt");
  expect(data?.releaseState).toBe("published");
  expect(readReleaseState(tmpDir, currentRelease)).toBe("published");
});

test("leitstand.rollback rejects --channel flag", async () => {
  const systemId = "test-sys";

  createRegistryWithChannels(tmpDir, systemId);

  await expect(
    runLeitstandRollback(makeInput({ system: systemId, channel: "main" }), makeContext(tmpDir)),
  ).rejects.toThrow("--channel is removed");
});

test("leitstand.rollback rejects when no previous release found", async () => {
  const systemId = "test-sys";

  createRegistryWithChannels(tmpDir, systemId);

  await expect(
    runLeitstandRollback(makeInput({ system: systemId }), makeContext(tmpDir)),
  ).rejects.toThrow("no previous release found");
});

test("leitstand.rollback rejects when release is in non-deployed state", async () => {
  const systemId = "test-sys";
  const currentRelease = "test-sys-r000002";

  createRegistryWithChannels(tmpDir, systemId, {
    lastPropagated: {
      alt: { releaseId: currentRelease, state: "succeeded", healthy: true },
    },
  });
  writeReleaseManifest(tmpDir, currentRelease, {
    schemaVersion: "1.0.0",
    releaseId: currentRelease,
    systemId,
    missionId: "test-sys-m000001",
    state: "published",
  });

  await expect(
    runLeitstandRollback(makeInput({ system: systemId }), makeContext(tmpDir)),
  ).rejects.toThrow("cannot rollback release in state 'published'");
});
