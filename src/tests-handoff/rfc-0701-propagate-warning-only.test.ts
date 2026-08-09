/*
<MODULE_CONTRACT>
  <purpose>RFC-0701: tests for warning-only behavior of distTreeHash/siteContentHash mismatches in leitstand.propagate when commitSha matches.</purpose>
  <keywords>RFC-0701, propagate, distTreeHash, siteContentHash, warning-only, build-identity, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0701: add tests verifying secondary hash mismatches produce warnings (not errors) when commitSha matches.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandPropagate } from "../leitstand/leitstand-commands.ts";
import { storeArtifactCore } from "../artifact-store/artifact-store-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";
import { expectData } from "./helpers/kernel-result-helpers.ts";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "3.99.0", ""),
}));

const MATCHING_COMMIT_SHA = "abc123def456";
const MANIFEST_DIST_TREE_HASH = "sha256:manifest-dist";
const MANIFEST_SITE_CONTENT_HASH = "sha256:manifest-content";
const DEVIATING_DIST_TREE_HASH = "sha256:deviating-dist";
const DEVIATING_SITE_CONTENT_HASH = "sha256:deviating-content";

function makeMockBuildIdentity(overrides: Record<string, unknown> = {}) {
  return {
    releaseId: "workpiece-test-sys-m000001",
    systemId: "test-sys",
    missionId: "test-sys-m000001",
    semver: "0.0.0-workpiece",
    distTreeHash: MANIFEST_DIST_TREE_HASH,
    behaviorSnapshotHash: "",
    siteContentHash: MANIFEST_SITE_CONTENT_HASH,
    platformVersion: "1.0.0",
    platformSemanticHash: "sha256:platform-hash",
    commitSha: MATCHING_COMMIT_SHA,
    buildTimestamp: "2026-01-01T00:00:00.000Z",
    targetPlatform: "cloudflare-workers",
    ...overrides,
  };
}

let mockFetch: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn(async (url: string) => {
    if (url.includes("build-identity.json")) {
      const current = (mockFetch as unknown as { _current?: Record<string, unknown> })._current;
      return {
        ok: true,
        status: 200,
        json: async () => current ?? makeMockBuildIdentity(),
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  warnSpy = vi.fn();
  return {
    workspaceRoot,
    logger: {
      info: () => {},
      success: () => {},
      warn: warnSpy,
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

function _readReleaseState(workspaceRoot: string, releaseId: string): string {
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

function createDistDir(workspaceRoot: string, releaseId: string): string {
  const distDir = join(workspaceRoot, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Hello</body></html>");
  return distDir;
}

function writeAxiomEvidence(workspaceRoot: string, missionId: string, commitSha: string): void {
  const evidenceDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    join(evidenceDir, "evidence-metadata.json"),
    JSON.stringify(
      {
        auditId: missionId,
        commitSha,
        methodologies: [
          {
            id: "automated-web-accessibility",
            digest: "sha256:mock",
            blockOn: ["high", "critical"],
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(evidenceDir, "study-run.json"),
    JSON.stringify({ findings: [] }, null, 2) + "\n",
  );
}

function setMockBuildIdentity(identity: Record<string, unknown>): void {
  (mockFetch as unknown as { _current?: Record<string, unknown> })._current = identity;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-rfc-0701-prop-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
});

async function runPropagate(buildIdentityOverrides: Record<string, unknown> = {}) {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  const missionId = "test-sys-m000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "ready",
    missionId,
    commitSha: MATCHING_COMMIT_SHA,
    behaviorSnapshotHash: "abc123",
    distTreeHash: MANIFEST_DIST_TREE_HASH,
    siteContentHash: MANIFEST_SITE_CONTENT_HASH,
    readyAt: "2026-07-10T00:00:00.000Z",
  });
  const distDir = createDistDir(tmpDir, releaseId);
  await storeArtifactCore(tmpDir, releaseId, distDir, systemId);
  writeAxiomEvidence(tmpDir, missionId, MATCHING_COMMIT_SHA);
  setMockBuildIdentity(makeMockBuildIdentity(buildIdentityOverrides));

  return runLeitstandPropagate(makeInput({ release: releaseId }), makeContext(tmpDir));
}

test("RFC-0701: distTreeHash mismatch with matching commitSha produces warning, not error", async () => {
  const result = await runPropagate({ distTreeHash: DEVIATING_DIST_TREE_HASH });

  expect(expectData(result).state).toBe("succeeded");
  expect(expectData(result).releaseState).toBe("alt-deployed");
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining("distTreeHash mismatch (commitSha matches)"),
  );
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining(`manifest='${MANIFEST_DIST_TREE_HASH}'`),
  );
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining(`identity='${DEVIATING_DIST_TREE_HASH}'`),
  );
}, 15_000);

test("RFC-0701: siteContentHash mismatch with matching commitSha produces warning, not error", async () => {
  const result = await runPropagate({ siteContentHash: DEVIATING_SITE_CONTENT_HASH });

  expect(expectData(result).state).toBe("succeeded");
  expect(expectData(result).releaseState).toBe("alt-deployed");
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining("siteContentHash mismatch (commitSha matches)"),
  );
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining(`manifest='${MANIFEST_SITE_CONTENT_HASH}'`),
  );
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining(`identity='${DEVIATING_SITE_CONTENT_HASH}'`),
  );
}, 15_000);

test("RFC-0701: both distTreeHash and siteContentHash mismatch with matching commitSha produces two warnings", async () => {
  const result = await runPropagate({
    distTreeHash: DEVIATING_DIST_TREE_HASH,
    siteContentHash: DEVIATING_SITE_CONTENT_HASH,
  });

  expect(expectData(result).state).toBe("succeeded");
  expect(expectData(result).releaseState).toBe("alt-deployed");
  const distTreeWarnings = warnSpy.mock.calls.filter((c) =>
    c[0]?.includes("distTreeHash mismatch"),
  );
  const siteContentWarnings = warnSpy.mock.calls.filter((c) =>
    c[0]?.includes("siteContentHash mismatch"),
  );
  expect(distTreeWarnings).toHaveLength(1);
  expect(siteContentWarnings).toHaveLength(1);
}, 15_000);

test("RFC-0701: commitSha mismatch (both non-0000000) remains a hard error", async () => {
  await expect(runPropagate({ commitSha: "different123456" })).rejects.toThrow(
    "commitSha 'different123456' does not match release commitSha",
  );
}, 15_000);

test("RFC-0701: warning message includes both manifest and identity hash values", async () => {
  await runPropagate({ distTreeHash: DEVIATING_DIST_TREE_HASH });

  const distTreeWarning = warnSpy.mock.calls.find((c) =>
    c[0]?.includes("distTreeHash mismatch (commitSha matches)"),
  );
  expect(distTreeWarning).toBeDefined();
  const message = distTreeWarning![0] as string;
  expect(message).toContain(`manifest='${MANIFEST_DIST_TREE_HASH}'`);
  expect(message).toContain(`identity='${DEVIATING_DIST_TREE_HASH}'`);
}, 15_000);
