import { describe, it, expect } from "vitest";
import { runMaterialize, createMaterializeCommand } from "../materialize/materialize.ts";
import { runMaterializeVerify, createMaterializeVerifyCommand } from "../materialize/materialize-verify.ts";
import { runProjectionStatus, createProjectionStatusCommand } from "../materialize/projection-status.ts";
import { runProjectionBuild, createProjectionBuildCommand } from "../materialize/projection-build.ts";
import { createKnowledgeMaterializeModule } from "../materialize/module.ts";
import type { KernelModuleRegistry } from "@warpgogol/werkstatt/kernel/types";

const WS = "/tmp/test-workspace";

describe("knowledge.materialize", () => {
  it("returns pending stub result", async () => {
    const r = await runMaterialize(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.materialize");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.canonicalHash).toBeNull();
    expect(r.data!.modelVersion).toBeNull();
    expect(r.data!.recordCount).toBe(0);
  });

  it("writes to .generated/knowledge/", () => {
    const cmd = createMaterializeCommand();
    expect(cmd.name).toBe("knowledge.materialize");
    expect(cmd.writes).toContain(".generated/knowledge/**");
  });
});

describe("knowledge.materialize.verify", () => {
  it("returns pending stub result", async () => {
    const r = await runMaterializeVerify(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.materialize.verify");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.hashMatch).toBe(false);
    expect(r.data!.violations).toEqual([]);
  });

  it("creates read-only command", () => {
    const cmd = createMaterializeVerifyCommand();
    expect(cmd.name).toBe("knowledge.materialize.verify");
    expect(cmd.writes).toBeUndefined();
  });
});

describe("knowledge.projection.status", () => {
  it("returns pending stub result", async () => {
    const r = await runProjectionStatus(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.projection.status");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.projections).toEqual([]);
    expect(r.data!.staleProjections).toEqual([]);
  });

  it("creates read-only command", () => {
    const cmd = createProjectionStatusCommand();
    expect(cmd.name).toBe("knowledge.projection.status");
    expect(cmd.writes).toBeUndefined();
  });
});

describe("knowledge.projection.build", () => {
  it("returns pending stub result", async () => {
    const r = await runProjectionBuild(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.projection.build");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.projectionsBuilt).toBe(0);
  });

  it("writes to projections/", () => {
    const cmd = createProjectionBuildCommand();
    expect(cmd.name).toBe("knowledge.projection.build");
    expect(cmd.writes).toContain("projections/**");
  });
});

describe("createKnowledgeMaterializeModule", () => {
  it("registers all 4 materialize commands", () => {
    const mod = createKnowledgeMaterializeModule();
    expect(mod.name).toBe("knowledge-materialize");
    expect(mod.version).toBe("0.1.0");

    const registered: string[] = [];
    const registry = {
      registerCommand: (cmd: { name: string }) => registered.push(cmd.name),
      registerPipeline: () => {},
    } as unknown as KernelModuleRegistry;
    mod.register(registry);
    expect(registered).toHaveLength(4);
    expect(registered).toContain("knowledge.materialize");
    expect(registered).toContain("knowledge.materialize.verify");
    expect(registered).toContain("knowledge.projection.status");
    expect(registered).toContain("knowledge.projection.build");
  });
});
