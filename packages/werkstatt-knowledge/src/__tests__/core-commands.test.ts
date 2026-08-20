import { describe, it, expect } from "vitest";
import { runKnowledgeVerify, createVerifyCommand } from "../core/verify.ts";
import { runKnowledgeStatus, createStatusCommand } from "../core/status.ts";
import { runKnowledgeCoverage, createCoverageCommand } from "../core/coverage.ts";
import { runKnowledgeAudit, createAuditCommand } from "../core/audit.ts";
import { runCandidateValidate, createCandidateValidateCommand } from "../core/candidate-validate.ts";
import { runPromote, createPromoteCommand } from "../core/promote.ts";
import { runTransactionStatus, createTransactionStatusCommand } from "../core/transaction-status.ts";
import { createKnowledgeCoreModule } from "../core/module.ts";
import type { KernelModuleRegistry } from "@warpgogol/werkstatt/kernel/types";

const WS = "/tmp/test-workspace";

describe("knowledge.verify", () => {
  it("returns pending stub result", async () => {
    const r = await runKnowledgeVerify(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.verify");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.violations).toEqual([]);
    expect(r.data!.recordCount).toBe(0);
  });

  it("creates command with correct metadata", () => {
    const cmd = createVerifyCommand();
    expect(cmd.name).toBe("knowledge.verify");
    expect(cmd.scope).toBe("workspace");
    expect(cmd.cacheable).toBe(false);
  });
});

describe("knowledge.status", () => {
  it("returns pending stub result", async () => {
    const r = await runKnowledgeStatus(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.status");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.datasetId).toBeNull();
    expect(r.data!.modelVersion).toBeNull();
    expect(r.data!.recordCount).toBe(0);
  });

  it("creates command with correct metadata", () => {
    const cmd = createStatusCommand();
    expect(cmd.name).toBe("knowledge.status");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("knowledge.coverage", () => {
  it("returns pending stub result", async () => {
    const r = await runKnowledgeCoverage(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.coverage");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.coverageClaims).toBe(0);
    expect(r.data!.violations).toEqual([]);
  });

  it("creates command with correct metadata", () => {
    const cmd = createCoverageCommand();
    expect(cmd.name).toBe("knowledge.coverage");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("knowledge.audit", () => {
  it("returns pending stub result", async () => {
    const r = await runKnowledgeAudit(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.audit");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.violations).toEqual([]);
  });

  it("creates command with correct metadata", () => {
    const cmd = createAuditCommand();
    expect(cmd.name).toBe("knowledge.audit");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("knowledge.candidate.validate", () => {
  it("returns pending stub result", async () => {
    const r = await runCandidateValidate(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.candidate.validate");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.candidates).toBe(0);
    expect(r.data!.violations).toEqual([]);
  });

  it("creates command with correct metadata", () => {
    const cmd = createCandidateValidateCommand();
    expect(cmd.name).toBe("knowledge.candidate.validate");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("knowledge.promote", () => {
  it("returns pending stub result", async () => {
    const r = await runPromote(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.promote");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.promotedRecords).toBe(0);
    expect(r.data!.transactionId).toBeNull();
  });

  it("creates command with writes to knowledge/ and staging/", () => {
    const cmd = createPromoteCommand();
    expect(cmd.name).toBe("knowledge.promote");
    expect(cmd.writes).toContain("knowledge/**");
    expect(cmd.writes).toContain("staging/**");
  });
});

describe("knowledge.transaction.status", () => {
  it("returns pending stub result", async () => {
    const r = await runTransactionStatus(WS);
    expect(r.exitCode).toBe(0);
    expect(r.data!.command).toBe("knowledge.transaction.status");
    expect(r.data!.status).toBe("pending");
    expect(r.data!.activeTransactions).toBe(0);
  });

  it("creates command with correct metadata", () => {
    const cmd = createTransactionStatusCommand();
    expect(cmd.name).toBe("knowledge.transaction.status");
    expect(cmd.scope).toBe("workspace");
  });
});

describe("createKnowledgeCoreModule", () => {
  it("registers all 7 core commands", () => {
    const mod = createKnowledgeCoreModule();
    expect(mod.name).toBe("knowledge-core");
    expect(mod.version).toBe("0.1.0");

    const registered: string[] = [];
    const registry = {
      registerCommand: (cmd: { name: string }) => registered.push(cmd.name),
      registerPipeline: () => {},
    } as unknown as KernelModuleRegistry;
    mod.register(registry);
    expect(registered).toHaveLength(7);
    expect(registered).toContain("knowledge.verify");
    expect(registered).toContain("knowledge.status");
    expect(registered).toContain("knowledge.coverage");
    expect(registered).toContain("knowledge.audit");
    expect(registered).toContain("knowledge.candidate.validate");
    expect(registered).toContain("knowledge.promote");
    expect(registered).toContain("knowledge.transaction.status");
  });
});
