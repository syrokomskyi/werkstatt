/*
<MODULE_CONTRACT>
  <purpose>RFC-0608: tests for leitstand.propagate —channel rejection and alt-deployed state transition.</purpose>
  <keywords>RFC-0608, leitstand, propagate, channel-removed, state-machine, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0608: add tests for leitstand.propagate --channel rejection and alt-deployed state transition.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandPropagate } from "../leitstand/leitstand-commands.ts";
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0608-prop-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

test("leitstand.propagate throws when --channel flag is passed", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "published",
    missionId: "test-sys-m000001",
  });
  createDistDir(tmpDir, releaseId);

  await expect(
    runLeitstandPropagate(makeInput({ release: releaseId, channel: "main" }), makeContext(tmpDir)),
  ).rejects.toThrow("--channel is removed; use leitstand.promote for main deployment");
});

test("leitstand.propagate transitions release to alt-deployed on success", async () => {
  const systemId = "test-sys";
  const releaseId = "test-sys-r000001";
  createRegistry(tmpDir, systemId);
  writeReleaseManifest(tmpDir, releaseId, {
    systemId,
    state: "published",
    missionId: "test-sys-m000001",
    behaviorSnapshotHash: "abc123",
  });
  const distDir = createDistDir(tmpDir, releaseId);

  // Create artifact store so preflight passes
  await storeArtifactCore(tmpDir, releaseId, distDir, systemId);

  const result = await runLeitstandPropagate(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  expect(result.data!.state).toBe("succeeded");
  expect(result.data!.channel).toBe("alt");
  expect(result.data!.releaseState).toBe("alt-deployed");
  expect(readReleaseState(tmpDir, releaseId)).toBe("alt-deployed");
});
