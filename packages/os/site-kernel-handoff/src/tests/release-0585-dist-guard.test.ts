/*
<MODULE_CONTRACT>
<purpose>RFC-0585: tests for release.publish distTreeHash guard and dist directory check.</purpose>
<keywords>RFC-0585, release.publish, distTreeHash, dist guard, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0585: add unit tests for release.publish distTreeHash pending guard and missing dist directory guard.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runReleasePublish } from "../release/release-commands.ts";
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-release-guard-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test("release.publish refuses when distTreeHash is sha256:pending", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId: "test-sys",
    missionId: "test-sys-m000001",
    semver: "0.1.0",
    state: "prepared",
    distTreeHash: "sha256:pending",
    snapshotDiffVerdict: "pass",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
  });

  await expect(
    runReleasePublish(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(/distTreeHash is pending or missing/);
});

test("release.publish refuses when distTreeHash is missing", async () => {
  const releaseId = "test-sys-r000002";
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId: "test-sys",
    missionId: "test-sys-m000001",
    semver: "0.1.0",
    state: "prepared",
    snapshotDiffVerdict: "pass",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
  });

  await expect(
    runReleasePublish(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(/distTreeHash is pending or missing/);
});

test("release.publish refuses when dist directory is missing", async () => {
  const releaseId = "test-sys-r000003";
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId: "test-sys",
    missionId: "test-sys-m000001",
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
});

test("release.publish refuses when snapshotDiffVerdict is fail", async () => {
  const releaseId = "test-sys-r000004";
  const releaseDir = join(tmpDir, "releases", releaseId);
  writeReleaseManifest(tmpDir, releaseId, {
    schemaVersion: "1.0.0",
    releaseId,
    systemId: "test-sys",
    missionId: "test-sys-m000001",
    semver: "0.1.0",
    state: "prepared",
    distTreeHash: "sha256:abc123def456",
    snapshotDiffVerdict: "fail",
    migratorVerdict: "pass",
    versionCompareVerdict: "in-sync",
  });
  mkdirSync(join(releaseDir, "dist"), { recursive: true });

  await expect(
    runReleasePublish(makeInput({ release: releaseId }), makeContext(tmpDir)),
  ).rejects.toThrow(/snapshot diff verdict is fail/);
});
