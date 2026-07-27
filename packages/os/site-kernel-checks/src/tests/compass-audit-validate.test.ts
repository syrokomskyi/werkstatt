import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runCompassAuditValidate, runCompassAuditBaseline } from "../compass-audit.ts";
import type { KernelCommandInput } from "@gogol/site-kernel";
import { makeTestContext } from "./helpers.ts";

const execFileAsync = promisify(execFile);

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for compass.audit.validate and compass.audit.baseline.
    Validates the full round-trip: baseline seeds missing entries → validate
    passes. Also tests that validate detects audit-overdue files in strict mode.
  </purpose>
</MODULE_CONTRACT>
*/

const AUTHORED_FILE = `/*
<MODULE_CONTRACT>
<purpose>Test file.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created for testing.</item>
</CHANGE_SUMMARY>
*/
export const x = 1;
`;

describe("compass.audit.baseline + validate round-trip", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "compass-audit-rt-"));
    await mkdir(join(workspaceRoot, "docs"), { recursive: true });
    await mkdir(join(workspaceRoot, "packages", "test-pkg", "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "packages", "test-pkg", "src", "index.ts"), AUTHORED_FILE);
    await mkdir(join(workspaceRoot, "packages", "test-pkg"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "packages", "test-pkg", "package.json"),
      '{"name":"test-pkg"}',
    );
    await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    await execFileAsync("git", ["init"], { cwd: workspaceRoot });
    await execFileAsync("git", ["add", "."], { cwd: workspaceRoot });
    await execFileAsync("git", ["commit", "-m", "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("validate reports overdue when no ledger exists (strict)", async () => {
    const input: KernelCommandInput = {
      flags: { strict: true, packages: true, package: "test-pkg" },
      argv: [],
      args: [],
    };

    const result = await runCompassAuditValidate(input, makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    expect(result.data!.dueCount).toBeGreaterThan(0);
  });

  it("validate passes (0 overdue) when no ledger exists (non-strict)", async () => {
    const input: KernelCommandInput = {
      flags: { packages: true, package: "test-pkg" },
      argv: [],
      args: [],
    };

    const result = await runCompassAuditValidate(input, makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    expect(result.data!.dueCount).toBeGreaterThan(0);
  });

  it("baseline seeds missing entries and validate passes after", async () => {
    const baselineInput: KernelCommandInput = {
      flags: { packages: true, package: "test-pkg" },
      argv: [],
      args: [],
    };

    const baselineResult = await runCompassAuditBaseline(
      baselineInput,
      makeTestContext(workspaceRoot),
    );

    expect(baselineResult.exitCode).toBe(0);
    expect(baselineResult.data!.seeded).toBeGreaterThan(0);

    const validateInput: KernelCommandInput = {
      flags: { strict: true, packages: true, package: "test-pkg" },
      argv: [],
      args: [],
    };

    const validateResult = await runCompassAuditValidate(
      validateInput,
      makeTestContext(workspaceRoot),
    );

    expect(validateResult.exitCode).toBe(0);
    expect(validateResult.data!.dueCount).toBe(0);
  });

  it("baseline is idempotent — second run seeds 0", async () => {
    const input: KernelCommandInput = {
      flags: { packages: true, package: "test-pkg" },
      argv: [],
      args: [],
    };

    const ctx = makeTestContext(workspaceRoot);

    const first = await runCompassAuditBaseline(input, ctx);
    expect(first.data!.seeded).toBeGreaterThan(0);

    const second = await runCompassAuditBaseline(input, ctx);
    expect(second.data!.seeded).toBe(0);
    expect(second.data!.total).toBe(first.data!.total);
  });

  it("ledger file is written to workspaceRoot/docs/", async () => {
    const input: KernelCommandInput = {
      flags: { packages: true, package: "test-pkg" },
      argv: [],
      args: [],
    };

    await runCompassAuditBaseline(input, makeTestContext(workspaceRoot));

    const ledgerContent = await readFile(
      join(workspaceRoot, "docs", "compass-audit-ledger.generated.yaml"),
      "utf8",
    );

    expect(ledgerContent).toContain("entries:");
    expect(ledgerContent).toContain("packages/test-pkg/src/index.ts");
  });
});
