import { describe, it, expect } from "vitest";
import { runExtractList, createExtractListCommand } from "../extract/list.ts";
import { runExtractRun, createExtractRunCommand } from "../extract/run.ts";
import { runExtractVerify, createExtractVerifyCommand } from "../extract/verify.ts";
import { runRefreshPrepare, createRefreshPrepareCommand } from "../extract/refresh-prepare.ts";
import { runRefreshApply, createRefreshApplyCommand } from "../extract/refresh-apply.ts";
import { createKnowledgeExtractModule } from "../extract/module.ts";
import type { KernelModuleRegistry } from "@warpgogol/werkstatt/kernel/types";

const WS = "/tmp/test-workspace";

describe("knowledge.extract.list", () => {
  it("returns pending stub result", async () => {
    const r = await runExtractList(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.extract.list");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.extractors).toEqual([]);
  });

  it("creates read-only command", () => {
    const cmd = createExtractListCommand();
    expect(cmd.name).toBe("knowledge.extract.list");
    expect(cmd.scope).toBe("workspace");
    expect(cmd.writes).toBeUndefined();
  });
});

describe("knowledge.extract.run", () => {
  it("returns pending stub result", async () => {
    const r = await runExtractRun(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.extract.run");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.deltasProduced).toBe(0);
  });

  it("writes to staging/", () => {
    const cmd = createExtractRunCommand();
    expect(cmd.name).toBe("knowledge.extract.run");
    expect(cmd.writes).toContain("staging/**");
  });
});

describe("knowledge.extract.verify", () => {
  it("returns pending stub result", async () => {
    const r = await runExtractVerify(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.extract.verify");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.deltasVerified).toBe(0);
    expect(r.data!.violations).toEqual([]);
  });

  it("creates read-only command", () => {
    const cmd = createExtractVerifyCommand();
    expect(cmd.name).toBe("knowledge.extract.verify");
    expect(cmd.writes).toBeUndefined();
  });
});

describe("knowledge.refresh.prepare", () => {
  it("returns pending stub result", async () => {
    const r = await runRefreshPrepare(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.refresh.prepare");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.impactedRecords).toBe(0);
  });

  it("writes to staging/", () => {
    const cmd = createRefreshPrepareCommand();
    expect(cmd.name).toBe("knowledge.refresh.prepare");
    expect(cmd.writes).toContain("staging/**");
  });
});

describe("knowledge.refresh.apply", () => {
  it("returns pending stub result", async () => {
    const r = await runRefreshApply(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.refresh.apply");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.recordsUpdated).toBe(0);
    expect(r.data!.transactionId).toBeNull();
  });

  it("writes to knowledge/ and staging/", () => {
    const cmd = createRefreshApplyCommand();
    expect(cmd.name).toBe("knowledge.refresh.apply");
    expect(cmd.writes).toContain("knowledge/**");
    expect(cmd.writes).toContain("staging/**");
  });
});

describe("createKnowledgeExtractModule", () => {
  it("registers all 5 extract commands", () => {
    const mod = createKnowledgeExtractModule();
    expect(mod.name).toBe("knowledge-extract");
    expect(mod.version).toBe("0.1.0");

    const registered: string[] = [];
    const registry = {
      registerCommand: (cmd: { name: string }) => registered.push(cmd.name),
      registerPipeline: () => {},
    } as unknown as KernelModuleRegistry;
    mod.register(registry);
    expect(registered).toHaveLength(5);
    expect(registered).toContain("knowledge.extract.list");
    expect(registered).toContain("knowledge.extract.run");
    expect(registered).toContain("knowledge.extract.verify");
    expect(registered).toContain("knowledge.refresh.prepare");
    expect(registered).toContain("knowledge.refresh.apply");
  });
});
