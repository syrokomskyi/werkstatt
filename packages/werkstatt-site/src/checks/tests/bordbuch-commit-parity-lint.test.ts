import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBordbuchCommitParityLint } from "../bordbuch-commit-parity-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0750: fixture tests for bordbuch.commit.parity.lint (BB-PARITY-01).</purpose>
</MODULE_CONTRACT>
*/

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

async function fixtureWorkspace(): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "bordbuch-parity-lint-"));
  await mkdir(join(root, "packages", "os", "site-kernel-handoff", "src", "bordbuch"), {
    recursive: true,
  });
  await mkdir(join(root, "packages", "os", "site-kernel-handoff", "src", "mission"), {
    recursive: true,
  });
  const context = {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: {
      readFile: (p: string) => readFile(p, "utf8"),
    },
  } as unknown as KernelRuntimeContext;
  return { root, context };
}

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

describe("bordbuch.commit.parity.lint (RFC-0750)", () => {
  let root: string;
  let context: KernelRuntimeContext;

  beforeEach(async () => {
    const ws = await fixtureWorkspace();
    root = ws.root;
    context = ws.context;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("red fixture: flags direct appendBordbuchEntry call outside whitelist", async () => {
    await writeFile(
      join(root, "packages", "os", "site-kernel-handoff", "src", "mission", "mission-open.ts"),
      'import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";\n\nawait appendBordbuchEntry(\n  workspaceRoot,\n  systemId,\n  "mission-open",\n  brief,\n  actor,\n);\n',
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "fail" }), context);
    expect(result.exitCode).toBe(1);
    expect(result.data!.diagnostics).toHaveLength(1);
    expect(result.data!.diagnostics[0].ruleId).toBe("BB-PARITY-01");
  });

  it("green fixture: whitelisted bordbuch-io.ts is not flagged", async () => {
    await writeFile(
      join(root, "packages", "os", "site-kernel-handoff", "src", "bordbuch", "bordbuch-io.ts"),
      "export async function appendBordbuchEntry() { return; }\n",
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "fail" }), context);
    expect(result.exitCode).toBe(0);
  });

  it("green fixture: whitelisted bordbuch-append.ts is not flagged", async () => {
    await writeFile(
      join(root, "packages", "os", "site-kernel-handoff", "src", "bordbuch", "bordbuch-append.ts"),
      'import { appendBordbuchEntry } from "./bordbuch-io.ts";\n',
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "fail" }), context);
    expect(result.exitCode).toBe(0);
  });

  it("green fixture: whitelisted bordbuch-commit-helper.ts is not flagged", async () => {
    await writeFile(
      join(
        root,
        "packages",
        "os",
        "site-kernel-handoff",
        "src",
        "bordbuch",
        "bordbuch-commit-helper.ts",
      ),
      'import { appendBordbuchEntry } from "./bordbuch-io.ts";\n',
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "fail" }), context);
    expect(result.exitCode).toBe(0);
  });

  it("green fixture: test files are not flagged", async () => {
    await mkdir(join(root, "packages", "os", "site-kernel-handoff", "src", "bordbuch", "tests"), {
      recursive: true,
    });
    await writeFile(
      join(
        root,
        "packages",
        "os",
        "site-kernel-handoff",
        "src",
        "bordbuch",
        "tests",
        "helper.test.ts",
      ),
      'import { appendBordbuchEntry } from "../bordbuch-io.ts";\n',
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "fail" }), context);
    expect(result.exitCode).toBe(0);
  });

  it("warning mode: violations are warnings, not errors", async () => {
    await writeFile(
      join(root, "packages", "os", "site-kernel-handoff", "src", "mission", "mission-close.ts"),
      'await appendBordbuchEntry(workspaceRoot, systemId, "mission-close", summary, actor);\n',
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "warning" }), context);
    expect(result.exitCode).toBe(0);
    expect(result.data!.diagnostics).toHaveLength(1);
    expect(result.data!.diagnostics[0].severity).toBe("warning");
  });

  it("green fixture: file using appendAndCommitBordbuch is not flagged", async () => {
    await writeFile(
      join(root, "packages", "os", "site-kernel-handoff", "src", "mission", "mission-abort.ts"),
      'import { appendAndCommitBordbuch } from "../bordbuch/bordbuch-commit-helper.ts";\n',
    );

    const result = await runBordbuchCommitParityLint(input({ mode: "fail" }), context);
    expect(result.exitCode).toBe(0);
  });
});
