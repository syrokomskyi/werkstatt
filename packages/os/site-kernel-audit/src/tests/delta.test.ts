import { test, expect, describe, vi } from "vitest";
import { runAuditDeltaRun } from "../delta.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";

function makeInput(flags: Record<string, string> = {}, args: string[] = []): KernelCommandInput {
  return {
    argv: [],
    args,
    flags,
  };
}

function makeContext(site?: string): KernelRuntimeContext {
  return {
    workspaceRoot: "/test",
    site: site ? { name: site } : undefined,
  } as unknown as KernelRuntimeContext;
}

describe("runAuditDeltaRun", () => {
  test("fails when no site is provided", async () => {
    const res = await runAuditDeltaRun(makeInput({ batch: "amend-001" }), makeContext());
    expect(res.exitCode).toBe(1);
    expect((res.data as { status: string }).status).toBe("fail");
  });

  test("fails when no batch flag is provided", async () => {
    const res = await runAuditDeltaRun(makeInput(), makeContext("test-app"));
    expect(res.exitCode).toBe(1);
    expect((res.data as { status: string }).status).toBe("fail");
  });

  test("reads batch from --batch= argument syntax", async () => {
    const res = await runAuditDeltaRun(
      makeInput({}, ["--batch=amend-001"]),
      makeContext("test-app"),
    );
    expect(res.exitCode).toBe(1);
    expect((res.data as { status: string }).status).toBe("fail");
    expect((res.data as { findings: { ruleId: string }[] }).findings[0].ruleId).toBe(
      "audit.delta.empty",
    );
  });

  test("reads batch from flags object", async () => {
    const res = await runAuditDeltaRun(makeInput({ batch: "amend-001" }), makeContext("test-app"));
    expect(res.exitCode).toBe(1);
    expect((res.data as { findings: { ruleId: string }[] }).findings[0].ruleId).toBe(
      "audit.delta.empty",
    );
  });

  test("summary contains violation count on fail", async () => {
    const res = await runAuditDeltaRun(makeInput(), makeContext());
    expect(res.summary).toContain("violation(s)");
  });
});
