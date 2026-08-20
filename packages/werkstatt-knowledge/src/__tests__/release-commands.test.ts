import { describe, it, expect } from "vitest";
import { runReleaseCheck, createReleaseCheckCommand } from "../release/check.ts";
import { runReleaseEvidence, createReleaseEvidenceCommand } from "../release/evidence.ts";
import { runReleaseManifest, createReleaseManifestCommand } from "../release/manifest.ts";
import { createKnowledgeReleaseModule } from "../release/module.ts";
import type { KernelModuleRegistry } from "@warpgogol/werkstatt/kernel/types";

const WS = "/tmp/test-workspace";

describe("knowledge.release.check", () => {
  it("returns pending stub result", async () => {
    const r = await runReleaseCheck(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.release.check");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.violations).toEqual([]);
  });

  it("creates read-only command", () => {
    const cmd = createReleaseCheckCommand();
    expect(cmd.name).toBe("knowledge.release.check");
    expect(cmd.scope).toBe("workspace");
    expect(cmd.writes).toBeUndefined();
  });
});

describe("knowledge.release.evidence", () => {
  it("returns pending stub result", async () => {
    const r = await runReleaseEvidence(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.release.evidence");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.datasetId).toBeNull();
    expect(r.data!.modelVersion).toBeNull();
    expect(r.data!.canonicalHash).toBeNull();
    expect(r.data!.materializationHash).toBeNull();
    expect(r.data!.recordCount).toBe(0);
  });

  it("writes release-evidence.json", () => {
    const cmd = createReleaseEvidenceCommand();
    expect(cmd.name).toBe("knowledge.release.evidence");
    expect(cmd.writes).toContain(".generated/knowledge/release-evidence.json");
  });
});

describe("knowledge.release.manifest", () => {
  it("returns pending stub result", async () => {
    const r = await runReleaseManifest(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.release.manifest");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.manifestPath).toBeNull();
  });

  it("writes release-manifest.yaml", () => {
    const cmd = createReleaseManifestCommand();
    expect(cmd.name).toBe("knowledge.release.manifest");
    expect(cmd.writes).toContain(".generated/knowledge/release-manifest.yaml");
  });
});

describe("createKnowledgeReleaseModule", () => {
  it("registers all 3 release commands", () => {
    const mod = createKnowledgeReleaseModule();
    expect(mod.name).toBe("knowledge-release");
    expect(mod.version).toBe("0.1.0");

    const registered: string[] = [];
    const registry = {
      registerCommand: (cmd: { name: string }) => registered.push(cmd.name),
      registerPipeline: () => {},
    } as unknown as KernelModuleRegistry;
    mod.register(registry);
    expect(registered).toHaveLength(3);
    expect(registered).toContain("knowledge.release.check");
    expect(registered).toContain("knowledge.release.evidence");
    expect(registered).toContain("knowledge.release.manifest");
  });
});
