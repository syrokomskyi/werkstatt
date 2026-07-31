/*
<MODULE_CONTRACT>
  <purpose>RFC-0627: tests for leitstand.deploy, propagate Axiom gate, and rollback auto-detect/auto-step.</purpose>
  <keywords>RFC-0627, leitstand, dev-channel, axiom-gate, rollback, state-machine, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0627: add tests for leitstand.deploy, propagate Axiom gate, and rollback auto-detect/auto-step.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandDeploy, runLeitstandPropagate, runLeitstandRollback } from "../leitstand/leitstand-commands.ts";
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

  const lpSection = lpEntries.length > 0
    ? `\n      lastPropagated:\n${lpEntries.join("\n")}`
    : "";

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

function writeAxiomFindings(
  workspaceRoot: string,
  missionId: string,
  errors: number,
  warnings: number,
  recordedAt?: string,
): void {
  const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
  mkdirSync(evidenceDir, { recursive: true });
  const findingsYaml = `schema: axiom-findings@1
capsuleRef: missions/${missionId}/evidence/axiom/evidence-capsule.yaml
recordedAt: ${recordedAt ?? "2026-07-15T12:00:00.000Z"}
methodology: web-accessibility
findings: []
summary:
  totalFindings: ${errors + warnings}
  errors: ${errors}
  warnings: ${warnings}
`;
  writeFileSync(join(evidenceDir, "findings.yaml"), findingsYaml);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0627-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// --- leitstand.deploy tests ---

test("leitstand.deploy transitions release from published to dev-deployed", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId: "test-sys-m000001",
    semver: "1.0.0",
    platformVersion: "1.0.0",
    createdAt: "2026-07-01T00:00:00.000Z",
    publishedAt: "2026-07-10T00:00:00.000Z",
    state: "published",
    commitSha: "abc123",
    platformSemanticHash: "hash1",
    siteContentHash: "hash2",
    distTreeHash: "hash3",
    distArtifactHash: "hash4",
    artifact: null,
    behaviorSnapshotHash: "hash5",
    readableSnapshotHash: "hash6",
    qualityReportHash: null,
    snapshotDiffVerdict: "pass",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
  });
  const distDir = createDistDir(tmpDir, releaseId);
  await storeArtifactCore(tmpDir, releaseId, distDir, systemId);

  const result = await runLeitstandDeploy(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("succeeded");
  expect(result.data!.channel).toBe("dev");
  expect(result.data!.releaseState).toBe("dev-deployed");
  expect(readReleaseState(tmpDir, releaseId)).toBe("dev-deployed");
});

test("leitstand.deploy rejects release not in published or dev-deployed state", async () => {
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
    runLeitstandDeploy(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("must be in state 'published' or 'dev-deployed'");
});

// --- leitstand.propagate Axiom gate tests ---

test("leitstand.propagate rejects release not in dev-deployed state", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId: "test-sys-m000001",
    state: "published",
  });

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("must be in state 'dev-deployed'");
});

test("leitstand.propagate rejects when no Axiom evidence exists", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId: "test-sys-m000001",
    state: "dev-deployed",
  });

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("no Axiom evidence found");
});

test("leitstand.propagate rejects when Axiom evidence has errors", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "dev-deployed",
    publishedAt: "2026-07-10T00:00:00.000Z",
  });
  writeAxiomFindings(tmpDir, missionId, 3, 2);

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("Axiom verification failed: 3 errors");
});

test("leitstand.propagate rejects when Axiom evidence is stale", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    missionId,
    state: "dev-deployed",
    publishedAt: "2026-07-15T00:00:00.000Z",
  });
  writeAxiomFindings(tmpDir, missionId, 0, 0, "2026-07-01T00:00:00.000Z");

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow("Axiom evidence is stale");
});

// --- leitstand.rollback auto-detect tests ---

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

  expect(result.data!.state).toBe("succeeded");
  expect(result.data!.channel).toBe("main");
  expect(result.data!.releaseState).toBe("alt-deployed");
  expect(readReleaseState(tmpDir, currentRelease)).toBe("alt-deployed");
});

test("leitstand.rollback auto-detects alt channel from alt-deployed state", async () => {
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

  expect(result.data!.state).toBe("succeeded");
  expect(result.data!.channel).toBe("alt");
  expect(result.data!.releaseState).toBe("dev-deployed");
  expect(readReleaseState(tmpDir, currentRelease)).toBe("dev-deployed");
});

test("leitstand.rollback auto-detects dev channel from dev-deployed state", async () => {
  const systemId = "test-sys";
  const currentRelease = "test-sys-r000002";
  const targetRelease = "test-sys-r000001";

  createRegistryWithChannels(tmpDir, systemId, {
    lastPropagated: {
      dev: { releaseId: currentRelease, state: "succeeded", healthy: true },
    },
  });
  writeReleaseManifest(tmpDir, currentRelease, {
    schemaVersion: "1.0.0",
    releaseId: currentRelease,
    systemId,
    missionId: "test-sys-m000001",
    state: "dev-deployed",
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

  expect(result.data!.state).toBe("succeeded");
  expect(result.data!.channel).toBe("dev");
  expect(result.data!.releaseState).toBe("published");
  expect(readReleaseState(tmpDir, currentRelease)).toBe("published");
});

test("leitstand.rollback rejects --channel flag", async () => {
  const systemId = "test-sys";

  createRegistryWithChannels(tmpDir, systemId);

  await expect(
    runLeitstandRollback(
      makeInput({ system: systemId, channel: "main" }),
      makeContext(tmpDir),
    ),
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
