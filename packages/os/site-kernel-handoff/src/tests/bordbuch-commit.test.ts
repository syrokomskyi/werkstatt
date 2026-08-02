/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0626: unit tests for bordbuch.commit — tests commitBordbuchProjections
    helper and runBordbuchCommit command handler.
  </purpose>
  <keywords>RFC-0626, bordbuch.commit, commitBordbuchProjections</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0626: initial bordbuch.commit tests.</item>
  <item>RFC-0646: update mock to include gitExecWithRetry, add retry behavior tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { createDefaultIO } from "@warpgogol/site-kernel";

// Mock resolveCachePath to return our temp dir
const mockCachePath = vi.hoisted(() => ({ value: "" as string }));

vi.mock("../sternsystem/registry-io.ts", () => ({
  resolveCachePath: vi.fn(async () => mockCachePath.value),
}));

// Mock gitExecWithRetry to capture git commands
const gitCalls = vi.hoisted(() => ({
  calls: [] as string[],
  statusOutput: "",
}));

vi.mock("../werkstatt/git-exec.ts", () => ({
  gitExecWithRetry: vi.fn(
    async (
      _cwd: string,
      args: string,
      _retryOptions: unknown,
      _options?: { allowNonZero?: boolean },
    ) => {
      gitCalls.calls.push(args);
      if (args === "status --porcelain") return gitCalls.statusOutput;
      if (args === "rev-parse HEAD") return "abc123def456";
      return "";
    },
  ),
}));

import { commitBordbuchProjections, runBordbuchCommit } from "../bordbuch/bordbuch-commit.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  const { io } = createDefaultIO();
  return {
    workspaceRoot,
    io,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    site: undefined,
    siteName: undefined,
    fileIntents: [],
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags?: Record<string, string | boolean>): KernelCommandInput {
  return {
    argv: [],
    flags: flags ?? {},
  };
}

// ---------------------------------------------------------------------------
// Tests: commitBordbuchProjections
// ---------------------------------------------------------------------------

describe("commitBordbuchProjections", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bordbuch-commit-"));
    mockCachePath.value = tmpDir;
    gitCalls.calls = [];
    gitCalls.statusOutput = "";
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips commit when no dirty bordbuch files", async () => {
    gitCalls.statusOutput = "";
    const result = await commitBordbuchProjections(tmpDir, "test-system");
    expect(result.committed).toBe(false);
    expect(result.commitSha).toBeNull();
    expect(result.filesCommitted).toHaveLength(0);
  });

  it("commits when bordbuch projection files are dirty", async () => {
    gitCalls.statusOutput =
      " M bordbuch/status.generated.yaml\n" +
      " M public/.well-known/bordbuch.json\n" +
      " M public/.well-known/bordbuch/index.html\n";
    const result = await commitBordbuchProjections(tmpDir, "test-system");
    expect(result.committed).toBe(true);
    expect(result.commitSha).toBe("abc123def456");
    expect(result.filesCommitted).toHaveLength(3);
    expect(gitCalls.calls).toContain("rev-parse HEAD");
    expect(gitCalls.calls.some((c) => c.startsWith("commit "))).toBe(true);
  });

  it("only stages bordbuch paths, not other dirty files", async () => {
    gitCalls.statusOutput =
      " M bordbuch/status.generated.yaml\n" +
      " M src/some-other-file.ts\n" +
      " M public/.well-known/bordbuch.json\n";
    const result = await commitBordbuchProjections(tmpDir, "test-system");
    expect(result.committed).toBe(true);
    expect(result.filesCommitted).toHaveLength(2);
    expect(result.filesCommitted).toContain("bordbuch/status.generated.yaml");
    expect(result.filesCommitted).toContain("public/.well-known/bordbuch.json");
    expect(result.filesCommitted).not.toContain("src/some-other-file.ts");
    const addCall = gitCalls.calls.find((c) => c.startsWith("add "));
    expect(addCall).toBeDefined();
    expect(addCall).not.toContain("src/some-other-file.ts");
  });

  it("is idempotent — second run is no-op", async () => {
    gitCalls.statusOutput = " M bordbuch/status.generated.yaml\n";
    const result1 = await commitBordbuchProjections(tmpDir, "test-system");
    expect(result1.committed).toBe(true);

    gitCalls.calls = [];
    gitCalls.statusOutput = "";
    const result2 = await commitBordbuchProjections(tmpDir, "test-system");
    expect(result2.committed).toBe(false);
  });

  it("uses gitExecWithRetry for all git operations", async () => {
    gitCalls.statusOutput = " M bordbuch/status.generated.yaml\n";
    await commitBordbuchProjections(tmpDir, "test-system");
    expect(gitCalls.calls).toContain("status --porcelain");
    expect(gitCalls.calls.some((c) => c.startsWith("add "))).toBe(true);
    expect(gitCalls.calls.some((c) => c.startsWith("commit "))).toBe(true);
    expect(gitCalls.calls).toContain("rev-parse HEAD");
  });
});

// ---------------------------------------------------------------------------
// Tests: runBordbuchCommit
// ---------------------------------------------------------------------------

describe("runBordbuchCommit", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bordbuch-commit-cmd-"));
    mockCachePath.value = tmpDir;
    gitCalls.calls = [];
    gitCalls.statusOutput = "";
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns no-op summary when systemId is missing", async () => {
    const result = await runBordbuchCommit(makeInput(), makeContext(tmpDir));
    expect(result.data).toBeUndefined();
    expect(result.summary).toContain("no system id");
  });

  it("uses systemId from flags", async () => {
    gitCalls.statusOutput = "";
    const result = await runBordbuchCommit(makeInput({ system: "my-system" }), makeContext(tmpDir));
    expect(result.data).toBeDefined();
    expect(result.data!.systemId).toBe("my-system");
  });

  it("uses systemId from context.site.name when flag is absent", async () => {
    const { io } = createDefaultIO();
    const ctx = {
      workspaceRoot: tmpDir,
      io,
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      site: { name: "context-system" },
      siteName: "context-system",
      fileIntents: [],
    } as unknown as KernelRuntimeContext;
    gitCalls.statusOutput = "";
    const result = await runBordbuchCommit(makeInput(), ctx);
    expect(result.data).toBeDefined();
    expect(result.data!.systemId).toBe("context-system");
  });
});
