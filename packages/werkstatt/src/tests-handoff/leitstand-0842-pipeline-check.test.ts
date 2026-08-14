/*
<MODULE_CONTRACT>
  <purpose>RFC-0842: tests for leitstand.pipeline.check — pipeline state inspection for releases.</purpose>
  <keywords>RFC-0842, leitstand, pipeline-check, state-machine, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0842: initial tests for leitstand.pipeline.check command.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandPipelineCheck } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";
import { expectData } from "./helpers/kernel-result-helpers.ts";

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

let testRoot: string;
let tmpDir: string;

beforeEach(() => {
  testRoot = mkdtempSync(join(process.cwd(), "tmp-leitstand-0842-pipe-"));
  tmpDir = join(testRoot, "workspace");
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

test("leitstand.pipeline.check throws when --release is missing", async () => {
  await expect(
    runLeitstandPipelineCheck(makeInput({}), makeContext(tmpDir)),
  ).rejects.toThrow("--release is required");
});

test("leitstand.pipeline.check throws when release not found", async () => {
  await expect(
    runLeitstandPipelineCheck(makeInput({ release: "nonexistent-r" }), makeContext(tmpDir)),
  ).rejects.toThrow("release 'nonexistent-r' not found");
});

test("pipeline.check: 'ready' state — release.prepare done, dev-deploy pending", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "ready",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("ready");
  expect(data.systemId).toBe("test-sys");
  expect(data.nextStep).toBe("leitstand.dev-deploy");

  const stepsByName = new Map(data.steps.map((s) => [s.step, s]));
  expect(stepsByName.get("release.prepare")!.status).toBe("done");
  expect(stepsByName.get("release.ready")!.status).toBe("done");
  expect(stepsByName.get("leitstand.dev-deploy")!.status).toBe("pending");
  expect(stepsByName.get("leitstand.propagate")!.status).toBe("pending");
  expect(stepsByName.get("leitstand.promote")!.status).toBe("pending");
});

test("pipeline.check: 'dev-deployed' state — dev-deploy done, propagate pending", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "dev-deployed",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("dev-deployed");
  expect(data.nextStep).toBe("leitstand.propagate");

  const stepsByName = new Map(data.steps.map((s) => [s.step, s]));
  expect(stepsByName.get("leitstand.dev-deploy")!.status).toBe("done");
  expect(stepsByName.get("leitstand.propagate")!.status).toBe("pending");
  expect(stepsByName.get("leitstand.promote")!.status).toBe("pending");
});

test("pipeline.check: 'alt-deployed' state — propagate done, promote pending", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "alt-deployed",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("alt-deployed");
  expect(data.nextStep).toBe("leitstand.promote");

  const stepsByName = new Map(data.steps.map((s) => [s.step, s]));
  expect(stepsByName.get("leitstand.propagate")!.status).toBe("done");
  expect(stepsByName.get("leitstand.promote")!.status).toBe("pending");
});

test("pipeline.check: 'main-deployed' state — all steps done", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "main-deployed",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("main-deployed");
  expect(data.nextStep).toBe("mission.archive");

  for (const step of data.steps) {
    expect(step.status).toBe("done");
  }
});

test("pipeline.check: 'promoted' state — all steps done, next is mission.archive", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "promoted",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("promoted");
  expect(data.nextStep).toBe("mission.archive");

  for (const step of data.steps) {
    expect(step.status).toBe("done");
  }
});

test("pipeline.check: 'prepared' state — next is release.ready", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "prepared",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("prepared");
  expect(data.nextStep).toBe("release.ready");

  const stepsByName = new Map(data.steps.map((s) => [s.step, s]));
  expect(stepsByName.get("release.prepare")!.status).toBe("done");
  expect(stepsByName.get("release.ready")!.status).toBe("pending");
});

test("pipeline.check: 'rolled-back' state — next is release.prepare", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "rolled-back",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("rolled-back");
  expect(data.nextStep).toBe("release.prepare");
});

test("pipeline.check: unknown state — release.prepare blocked, next is release.prepare", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "some-unknown-state",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  const data = expectData(result);
  expect(data.releaseState).toBe("some-unknown-state");
  expect(data.nextStep).toBe("release.prepare");

  const stepsByName = new Map(data.steps.map((s) => [s.step, s]));
  expect(stepsByName.get("release.prepare")!.status).toBe("blocked");
  expect(stepsByName.get("release.prepare")!.detail).toContain("unknown state");
});

test("pipeline.check: summary contains release id, state, and next step", async () => {
  const releaseId = "test-sys-r000001";
  writeReleaseManifest(tmpDir, releaseId, {
    systemId: "test-sys",
    state: "ready",
    missionId: "test-sys-m000001",
  });

  const result = await runLeitstandPipelineCheck(
    makeInput({ release: releaseId }),
    makeContext(tmpDir),
  );

  expect(result.summary).toContain(releaseId);
  expect(result.summary).toContain("state=ready");
  expect(result.summary).toContain("next=leitstand.dev-deploy");
});
