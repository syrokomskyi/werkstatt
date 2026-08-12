import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runDeployPreflight } from "../env/deploy-preflight.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    Unit tests for deploy.preflight DEPLOY-PREFLIGHT-04 fixHint (RFC-0819).
    Verifies that the null convention is suggested in the error message for empty values,
    and that null values pass deploy.preflight without error.
  </purpose>
</MODULE_CONTRACT>
*/

describe("deploy.preflight DEPLOY-PREFLIGHT-04 (RFC-0819)", () => {
  let tempRoot: string;
  let serviceDir: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "deploy-preflight-test-"));
    serviceDir = join(tempRoot, "services", "test-svc");
    await mkdir(serviceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function runPreflight(flags: Record<string, unknown>) {
    const input = { flags } as unknown as KernelCommandInput;
    const context = { workspaceRoot: tempRoot } as unknown as KernelRuntimeContext;
    return runDeployPreflight(input, context);
  }

  it("fixHint for empty value includes null suggestion", async () => {
    await writeFile(join(serviceDir, ".env.example"), "TEST_KEY=\n");
    await writeFile(join(serviceDir, ".env"), "TEST_KEY=\n");

    const result = await runPreflight({ service: "test-svc" });

    expect(result.exitCode).toBe(1);
    const diagnostics = result.data?.diagnostics ?? [];
    const dep04 = diagnostics.find((d) => d.ruleId === "DEPLOY-PREFLIGHT-04");
    expect(dep04).toBeDefined();
    expect(dep04?.fixHint).toContain("null");
  });

  it("KEY=null passes deploy.preflight without error", async () => {
    await writeFile(join(serviceDir, ".env.example"), "TEST_KEY=\n");
    await writeFile(join(serviceDir, ".env"), "TEST_KEY=null\n");

    const result = await runPreflight({ service: "test-svc" });

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fixHint for empty value in --dev mode also includes null suggestion", async () => {
    await writeFile(join(serviceDir, ".env.dev.example"), "TEST_KEY=\n");
    await writeFile(join(serviceDir, ".env.dev"), "TEST_KEY=\n");

    const result = await runPreflight({ service: "test-svc", dev: true });

    expect(result.exitCode).toBe(1);
    const diagnostics = result.data?.diagnostics ?? [];
    const dep04 = diagnostics.find((d) => d.ruleId === "DEPLOY-PREFLIGHT-04");
    expect(dep04).toBeDefined();
    expect(dep04?.fixHint).toContain("null");
  });

  it("KEY=null passes deploy.preflight --dev without error", async () => {
    await writeFile(join(serviceDir, ".env.dev.example"), "TEST_KEY=\n");
    await writeFile(join(serviceDir, ".env.dev"), "TEST_KEY=null\n");

    const result = await runPreflight({ service: "test-svc", dev: true });

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
