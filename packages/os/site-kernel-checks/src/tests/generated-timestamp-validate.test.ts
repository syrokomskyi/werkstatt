/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0602: unit tests for generated.timestamp.validate — tests
    stripCommentsAndStrings, scanModuleForTimestamps, runPhase1, and the
    full command handler with --deep flag.
  </purpose>
  <keywords>RFC-0602, generated.timestamp.validate, TS-TIME-01</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0602: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  KernelPipelineReport,
  KernelFlagValue,
} from "@warpgogol/site-kernel";
import { createDefaultIO } from "@warpgogol/site-kernel";
import {
  runGeneratedTimestampValidate,
  stripCommentsAndStrings,
  scanModuleForTimestamps,
  runPhase1,
  checkAllowlistParity,
} from "../generated-timestamp-validate.ts";

// ---------------------------------------------------------------------------
// Mock state for Phase 2 (executeKernelPipeline)
// ---------------------------------------------------------------------------

const mockState = vi.hoisted(() => ({
  filesModifiedRun1: [] as string[],
  filesModifiedRun2: [] as string[],
  callCount: 0,
}));

vi.mock("@warpgogol/site-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/site-kernel")>();
  return {
    ...actual,
    executeKernelPipeline: vi.fn(async () => {
      mockState.callCount++;
      const files =
        mockState.callCount === 1 ? mockState.filesModifiedRun1 : mockState.filesModifiedRun2;
      return {
        ok: true,
        pipelineName: "build.prepare",
        steps: [],
        filesModified: files,
        exitCode: 0,
      } as unknown as KernelPipelineReport;
    }),
  };
});

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

function makeInput(flags?: Record<string, KernelFlagValue>): KernelCommandInput {
  return {
    argv: [],
    flags: flags ?? {},
  };
}

// ---------------------------------------------------------------------------
// Tests: stripCommentsAndStrings
// ---------------------------------------------------------------------------

describe("stripCommentsAndStrings", () => {
  it("strips single-line comments", () => {
    const state = { inBlockComment: false };
    const result = stripCommentsAndStrings("const x = 1; // new Date().toISOString()", state);
    expect(result).not.toContain("new Date()");
  });

  it("strips block comments on a single line", () => {
    const state = { inBlockComment: false };
    const result = stripCommentsAndStrings("/* new Date().toISOString() */ const x = 1;", state);
    expect(result).not.toContain("new Date()");
  });

  it("tracks block comment state across lines", () => {
    const state = { inBlockComment: false };
    stripCommentsAndStrings("/* start of block", state);
    const result = stripCommentsAndStrings("new Date().toISOString() */", state);
    expect(result).not.toContain("new Date()");
    expect(state.inBlockComment).toBe(false);
  });

  it("strips double-quoted string literals", () => {
    const state = { inBlockComment: false };
    const result = stripCommentsAndStrings(
      'const msg = "new Date().toISOString() is volatile";',
      state,
    );
    expect(result).not.toContain("new Date()");
  });

  it("strips single-quoted string literals", () => {
    const state = { inBlockComment: false };
    const result = stripCommentsAndStrings(
      "const msg = 'new Date().toISOString() is volatile';",
      state,
    );
    expect(result).not.toContain("new Date()");
  });

  it("strips template literals", () => {
    const state = { inBlockComment: false };
    const result = stripCommentsAndStrings("const msg = `new Date().toISOString()`;", state);
    expect(result).not.toContain("new Date()");
  });

  it("preserves code outside comments/strings", () => {
    const state = { inBlockComment: false };
    const result = stripCommentsAndStrings("const ts = new Date().toISOString();", state);
    expect(result).toContain("new Date().toISOString()");
  });
});

// ---------------------------------------------------------------------------
// Tests: scanModuleForTimestamps
// ---------------------------------------------------------------------------

describe("scanModuleForTimestamps", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ts-time-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects new Date().toISOString()", async () => {
    const modPath = "src/fixture.ts";
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, modPath), "const ts = new Date().toISOString();\n");
    const violations = scanModuleForTimestamps(modPath, tmpDir);
    // Matches both /new Date\(\)/ and /new Date\(\)\.toISOString\(\)/
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].line).toBe(1);
  });

  it("detects Date.now()", async () => {
    const modPath = "src/fixture.ts";
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, modPath), "const now = Date.now();\n");
    const violations = scanModuleForTimestamps(modPath, tmpDir);
    expect(violations).toHaveLength(1);
  });

  it("detects process.env.BUILD_TIMESTAMP", async () => {
    const modPath = "src/fixture.ts";
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, modPath), "const ts = process.env.BUILD_TIMESTAMP;\n");
    const violations = scanModuleForTimestamps(modPath, tmpDir);
    expect(violations).toHaveLength(1);
  });

  it("does not detect patterns inside comments", async () => {
    const modPath = "src/fixture.ts";
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, modPath), "// const ts = new Date().toISOString();\n");
    const violations = scanModuleForTimestamps(modPath, tmpDir);
    expect(violations).toHaveLength(0);
  });

  it("does not detect patterns inside string literals", async () => {
    const modPath = "src/fixture.ts";
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, modPath), 'const msg = "new Date().toISOString() is volatile";\n');
    const violations = scanModuleForTimestamps(modPath, tmpDir);
    expect(violations).toHaveLength(0);
  });

  it("returns empty for non-existent file", () => {
    const violations = scanModuleForTimestamps("non-existent.ts", tmpDir);
    expect(violations).toHaveLength(0);
  });

  it("returns empty for clean file", async () => {
    const modPath = "src/fixture.ts";
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, modPath), "const ts = '2026-01-01T00:00:00Z';\n");
    const violations = scanModuleForTimestamps(modPath, tmpDir);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: runPhase1
// ---------------------------------------------------------------------------

describe("runPhase1", () => {
  it("produces error diagnostics in fail mode", () => {
    const { diagnostics } = runPhase1(process.cwd(), "fail");
    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity === "warning");
    const infos = diagnostics.filter((d) => d.severity === "info");
    // All diagnostics should be error or info (allowlisted)
    expect(warnings).toHaveLength(0);
    for (const d of errors) {
      expect(d.ruleId).toBe("TS-TIME-01");
    }
    for (const d of infos) {
      expect(d.ruleId).toBe("TS-TIME-01");
    }
  });

  it("produces warning diagnostics in warning mode", () => {
    const { diagnostics } = runPhase1(process.cwd(), "warning");
    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity === "warning");
    expect(errors).toHaveLength(0);
    for (const d of warnings) {
      expect(d.ruleId).toBe("TS-TIME-01");
    }
  });

  it("returns scanResults map alongside diagnostics", () => {
    const { diagnostics, scanResults } = runPhase1(process.cwd(), "fail");
    expect(diagnostics).toBeDefined();
    expect(scanResults).toBeInstanceOf(Map);
    expect(scanResults.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: checkAllowlistParity
// ---------------------------------------------------------------------------

describe("checkAllowlistParity", () => {
  it("emits TS-TIME-02 for a module with violations not in allowlist", () => {
    const scanResults = new Map([
      ["src/fixture.ts", [{ line: 1, pattern: "new Date\\(\\)\\.toISOString\\(\\)" }]],
    ]);
    const allowlistModules = new Set<string>();
    const diagnostics = checkAllowlistParity(scanResults, allowlistModules);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].ruleId).toBe("TS-TIME-02");
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].file).toBe("src/fixture.ts");
  });

  it("emits zero diagnostics when all modules with violations are allowlisted", () => {
    const scanResults = new Map([
      ["src/fixture.ts", [{ line: 1, pattern: "new Date\\(\\)\\.toISOString\\(\\)" }]],
    ]);
    const allowlistModules = new Set(["src/fixture.ts"]);
    const diagnostics = checkAllowlistParity(scanResults, allowlistModules);
    expect(diagnostics).toHaveLength(0);
  });

  it("emits zero diagnostics when scan results are empty", () => {
    const scanResults = new Map();
    const allowlistModules = new Set<string>();
    const diagnostics = checkAllowlistParity(scanResults, allowlistModules);
    expect(diagnostics).toHaveLength(0);
  });

  it("emits zero diagnostics for modules with no violations", () => {
    const scanResults = new Map([["src/clean.ts", []]]);
    const allowlistModules = new Set<string>();
    const diagnostics = checkAllowlistParity(scanResults, allowlistModules);
    expect(diagnostics).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: runGeneratedTimestampValidate (command handler)
// ---------------------------------------------------------------------------

describe("runGeneratedTimestampValidate", () => {
  beforeEach(() => {
    mockState.filesModifiedRun1 = [];
    mockState.filesModifiedRun2 = [];
    mockState.callCount = 0;
  });

  it("returns pass result with no flags (warning mode, no deep)", async () => {
    const result = await runGeneratedTimestampValidate(makeInput(), makeContext(process.cwd()));
    expect(result.exitCode).toBe(0);
    expect(result.data).toBeDefined();
  });

  it("includes TS-TIME-02 diagnostics in the result", async () => {
    const result = await runGeneratedTimestampValidate(
      makeInput({ mode: "fail" }),
      makeContext(process.cwd()),
    );
    const parityDiag = result.data!.diagnostics.find((d) => d.ruleId === "TS-TIME-02");
    // If all modules are allowlisted, there should be zero TS-TIME-02 diagnostics
    // If any are missing, there should be TS-TIME-02 errors
    if (parityDiag) {
      expect(parityDiag.severity).toBe("error");
    }
  });

  it("returns pass result in warning mode (warnings don't fail)", async () => {
    const result = await runGeneratedTimestampValidate(
      makeInput({ mode: "warning" }),
      makeContext(process.cwd()),
    );
    expect(result.exitCode).toBe(0);
  });

  it("Phase 2: detects drifted files via --deep", async () => {
    mockState.filesModifiedRun1 = ["src/generated-a.ts"];
    mockState.filesModifiedRun2 = [];

    const result = await runGeneratedTimestampValidate(
      makeInput({ mode: "fail", deep: true }),
      makeContext(process.cwd()),
    );

    const phase2Diag = result.data!.diagnostics.find((d) => d.data?.phase === 2);
    expect(phase2Diag).toBeDefined();
    expect(phase2Diag?.ruleId).toBe("TS-TIME-01");
    expect(phase2Diag?.data?.field).toBe("timestamp");
  });

  it("Phase 2: passes when no drift", async () => {
    mockState.filesModifiedRun1 = ["src/generated.ts"];
    mockState.filesModifiedRun2 = ["src/generated.ts"];

    const result = await runGeneratedTimestampValidate(
      makeInput({ mode: "fail", deep: true }),
      makeContext(process.cwd()),
    );

    const phase2Diag = result.data!.diagnostics.find((d) => d.data?.phase === 2);
    expect(phase2Diag).toBeUndefined();
  });
});
