/*
<MODULE_CONTRACT>
<purpose>RFC-0596: tests for storeArtifactCore extraction, automatic artifact storage in release.publish, and release.validate artifact check.</purpose>
<keywords>RFC-0596, storeArtifactCore, release.publish, artifact storage, release.validate, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0596: add unit tests for storeArtifactCore (lock-free, idempotent, systemId), release.publish artifact-before-transition, and release.validate published-artifact check.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { storeArtifactCore } from "../artifact-store/artifact-store-commands.ts";
import { runReleasePublish, runReleaseValidate } from "../release/release-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";

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
  return { flags, argv: [], args: [] };
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

function readReleaseManifestFile(workspaceRoot: string, releaseId: string): Record<string, string> {
  const content = readFileSync(join(workspaceRoot, "releases", releaseId, "release.yaml"), "utf8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

function createDistDir(workspaceRoot: string, releaseId: string): string {
  const distDir = join(workspaceRoot, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Hello</body></html>");
  return distDir;
}

function createRegistry(workspaceRoot: string, systemId: string, cachePath: string): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: ${systemId}
    cosmicStar: Acamar
    mirrors:
      - path: ${cachePath}
        storageType: non-bare
    pinnedPlatform: 1.0.0
    currentMission: null
    lastRelease: null
    status: active
    registeredAt: 2026-01-01T00:00:00.000Z
    notes: ""
`;
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-release-0596-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- storeArtifactCore tests ---

test("storeArtifactCore stores artifact manifest and returns correct fields", async () => {
  const releaseId = "test-sys-r000001";
  const distDir = join(tmpDir, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html></html>");

  const result = await storeArtifactCore(tmpDir, releaseId, distDir, "test-sys");

  expect(result.distArtifactHash).toMatch(/^sha256:/);
  expect(result.uri).toMatch(/^local:\/\//);
  expect(result.distTreeHash).toMatch(/^sha256:/);
  expect(result.byteSize).toBeGreaterThan(0);
  expect(result.fileCount).toBe(1);
  expect(result.createdAt).toBeTruthy();

  // Verify manifest file exists on disk
  const manifestUri = result.uri.replace("local://", "");
  expect(existsSync(manifestUri)).toBe(true);
  const manifest = JSON.parse(readFileSync(manifestUri, "utf8"));
  expect(manifest.releaseId).toBe(releaseId);
  expect(manifest.systemId).toBe("test-sys");
  expect(manifest.distArtifactHash).toBe(result.distArtifactHash);
});

test("storeArtifactCore does not create lock files", async () => {
  const releaseId = "test-sys-r000002";
  const distDir = join(tmpDir, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html></html>");

  await storeArtifactCore(tmpDir, releaseId, distDir, "test-sys");

  // Check no lock files were created
  const lockDir = join(tmpDir, ".werkstatt", "locks");
  if (existsSync(lockDir)) {
    const lockFiles = readdirSync(lockDir);
    expect(lockFiles).toHaveLength(0);
  }
});

test("storeArtifactCore uses provided systemId, not releaseId.split", async () => {
  const releaseId = "my-system-r000003";
  const distDir = join(tmpDir, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html></html>");

  // Pass a systemId that differs from what releaseId.split("-r")[0] would produce
  const result = await storeArtifactCore(tmpDir, releaseId, distDir, "custom-sys-id");

  const manifestUri = result.uri.replace("local://", "");
  const manifest = JSON.parse(readFileSync(manifestUri, "utf8"));
  expect(manifest.systemId).toBe("custom-sys-id");
  expect(manifest.systemId).not.toBe("my-system");
});

test("storeArtifactCore is idempotent — re-running overwrites manifest", async () => {
  const releaseId = "test-sys-r000004";
  const distDir = join(tmpDir, "releases", releaseId, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html>v1</html>");

  const result1 = await storeArtifactCore(tmpDir, releaseId, distDir, "test-sys");

  // Run again with same content — should overwrite, not duplicate
  const result2 = await storeArtifactCore(tmpDir, releaseId, distDir, "test-sys");

  expect(result2.distArtifactHash).toBe(result1.distArtifactHash);
  expect(result2.uri).toBe(result1.uri);
});

// --- release.publish tests ---

test("release.publish stores artifact before state transition", async () => {
  const releaseId = "test-sys-r000010";
  const systemId = "test-sys";
  const cachePath = join(tmpDir, "cache", systemId);
  mkdirSync(cachePath, { recursive: true });

  createRegistry(tmpDir, systemId, cachePath);
  createDistDir(tmpDir, releaseId);

  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    semver: "0.1.0",
    state: "prepared",
    distTreeHash: "sha256:abc123def456",
    snapshotDiffVerdict: "pass",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
    artifact: null,
    distArtifactHash: null,
  });

  const result = await runReleasePublish(makeInput({ release: releaseId }), makeContext(tmpDir));

  expect(result.data!.state).toBe("published");
  expect(result.data!.artifactUri).not.toBeNull();
  expect(result.data!.distArtifactHash).not.toBeNull();
  expect(result.data!.distArtifactHash).toMatch(/^sha256:/);

  // Verify release.yaml has artifact and distArtifactHash set AND state: published
  const manifest = readReleaseManifestFile(tmpDir, releaseId);
  expect(manifest.state).toBe("published");
  expect(manifest.artifact).not.toBe("null");
  expect(manifest.distArtifactHash).not.toBe("null");
  expect(manifest.artifact).toMatch(/^local:\/\//);
});

test("release.publish output includes distArtifactHash field", async () => {
  const releaseId = "test-sys-r000011";
  const systemId = "test-sys";
  const cachePath = join(tmpDir, "cache", systemId);
  mkdirSync(cachePath, { recursive: true });

  createRegistry(tmpDir, systemId, cachePath);
  createDistDir(tmpDir, releaseId);

  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    semver: "0.1.0",
    state: "prepared",
    distTreeHash: "sha256:abc123def456",
    snapshotDiffVerdict: "pass",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
    artifact: null,
    distArtifactHash: null,
  });

  const result = await runReleasePublish(makeInput({ release: releaseId }), makeContext(tmpDir));

  expect(result.data).toHaveProperty("distArtifactHash");
  expect(result.data!.distArtifactHash).not.toBeNull();
  expect(result.data!.distArtifactHash).toMatch(/^sha256:/);
});

test("release.publish fails on missing dist — state remains prepared", async () => {
  const releaseId = "test-sys-r000012";
  const systemId = "test-sys";

  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId,
    semver: "0.1.0",
    state: "prepared",
    distTreeHash: "sha256:abc123def456",
    snapshotDiffVerdict: "pass",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
  });

  await expect(
    runReleasePublish(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(/no dist\/ directory/);

  // Verify state remains prepared
  const manifest = readReleaseManifestFile(tmpDir, releaseId);
  expect(manifest.state).toBe("prepared");
});

// --- release.validate tests ---

test("release.validate flags published release without artifact", async () => {
  const releaseId = "test-sys-r000020";

  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId: "test-sys",
    semver: "0.1.0",
    state: "published",
    distTreeHash: "sha256:abc123def456",
    snapshotDiffVerdict: "pass",
    artifact: null,
  });

  const result = await runReleaseValidate(makeInput({ release: releaseId }), makeContext(tmpDir));

  expect(result.data!.state).toBe("published");
  expect(result.data!.artifactPresent).toBe(false);
});

test("release.validate passes published release with artifact", async () => {
  const releaseId = "test-sys-r000021";

  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId: "test-sys",
    semver: "0.1.0",
    state: "published",
    distTreeHash: "sha256:abc123def456",
    snapshotDiffVerdict: "pass",
    artifact: "local:///some/path/manifest.json",
  });

  const result = await runReleaseValidate(makeInput({ release: releaseId }), makeContext(tmpDir));

  expect(result.data!.state).toBe("published");
  expect(result.data!.artifactPresent).toBe(true);
});
