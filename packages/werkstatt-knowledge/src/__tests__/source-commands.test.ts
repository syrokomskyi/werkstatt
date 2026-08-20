import { describe, it, expect } from "vitest";
import { runSourceScan, createSourceScanCommand } from "../source/scan.ts";
import { runSourceStatus, createSourceStatusCommand } from "../source/status.ts";
import { runSourceBind, createSourceBindCommand } from "../source/bind.ts";
import { runSourceVerify, createSourceVerifyCommand } from "../source/verify.ts";
import { createKnowledgeSourceModule } from "../source/module.ts";
import type { KernelModuleRegistry } from "@warpgogol/werkstatt/kernel/types";

describe("knowledge.source.scan", () => {
  it("returns pending stub result", async () => {
    const result = await runSourceScan("/tmp/test-workspace");
    expect(result.exitCode).toBe(0);
    expect(result.data!.command).toBe("knowledge.source.scan");
    expect(result.data!.status).toBe("pending");
    expect(result.data!.sourceRoot).toBeNull();
    expect(result.data!.sourceUnits).toEqual([]);
    expect(result.data!.message).toContain("/tmp/test-workspace");
  });

  it("creates command with correct name and scope", () => {
    const cmd = createSourceScanCommand();
    expect(cmd.name).toBe("knowledge.source.scan");
    expect(cmd.scope).toBe("workspace");
    expect(cmd.cacheable).toBe(false);
  });

  it("declares read-only access (no writes)", () => {
    const cmd = createSourceScanCommand();
    expect(cmd.reads).toContain("../*-source/**");
    expect(cmd.writes).toBeUndefined();
  });
});

describe("knowledge.source.status", () => {
  it("returns pending stub result", async () => {
    const result = await runSourceStatus("/tmp/test-workspace");
    expect(result.exitCode).toBe(0);
    expect(result.data!.command).toBe("knowledge.source.status");
    expect(result.data!.status).toBe("pending");
    expect(result.data!.driftDetected).toBe(false);
    expect(result.data!.bindings).toBe(0);
  });

  it("creates command with correct name", () => {
    const cmd = createSourceStatusCommand();
    expect(cmd.name).toBe("knowledge.source.status");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("knowledge.source.bind", () => {
  it("returns pending stub result", async () => {
    const result = await runSourceBind("/tmp/test-workspace");
    expect(result.exitCode).toBe(0);
    expect(result.data!.command).toBe("knowledge.source.bind");
    expect(result.data!.status).toBe("pending");
    expect(result.data!.bindingsCreated).toBe(0);
  });

  it("creates command with writes to knowledge/", () => {
    const cmd = createSourceBindCommand();
    expect(cmd.name).toBe("knowledge.source.bind");
    expect(cmd.writes).toContain("knowledge/**");
  });
});

describe("knowledge.source.verify", () => {
  it("returns pending stub result", async () => {
    const result = await runSourceVerify("/tmp/test-workspace");
    expect(result.exitCode).toBe(0);
    expect(result.data!.command).toBe("knowledge.source.verify");
    expect(result.data!.status).toBe("pending");
    expect(result.data!.violations).toEqual([]);
  });

  it("creates command with correct name", () => {
    const cmd = createSourceVerifyCommand();
    expect(cmd.name).toBe("knowledge.source.verify");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("createKnowledgeSourceModule", () => {
  it("registers all 4 source commands", () => {
    const mod = createKnowledgeSourceModule();
    expect(mod.name).toBe("knowledge-source");
    expect(mod.version).toBe("0.1.0");

    const registered: string[] = [];
    const registry = {
      registerCommand: (cmd: { name: string }) => registered.push(cmd.name),
      registerPipeline: () => {},
    } as unknown as KernelModuleRegistry;
    mod.register(registry);
    expect(registered).toContain("knowledge.source.scan");
    expect(registered).toContain("knowledge.source.status");
    expect(registered).toContain("knowledge.source.bind");
    expect(registered).toContain("knowledge.source.verify");
    expect(registered).toHaveLength(4);
  });
});
