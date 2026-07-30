/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0602: Enforce timestamp determinism in generated files. Scans generator
    source modules (identified by GENERATOR_OWNERSHIP_MAP) for volatile timestamp
    patterns (new Date(), Date.now(), process.env.BUILD_TIMESTAMP). Phase 2
    (--deep) runs build.prepare twice and diffs generated files for drift.
  </purpose>
  <non-goals>
    <item>Does not scan non-generator source files — only modules listed in GENERATOR_OWNERSHIP_MAP.</item>
    <item>Does not fix violations — only reports diagnostics.</item>
    <item>Phase 2 is never run inside build.check — it is standalone via --deep only.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0602: initial implementation — Phase 1 source lint + Phase 2 double-build drift detection.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { executeKernelPipeline } from "@warpgogol/site-kernel";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
import { diagnosticsResult } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

export interface TimestampAllowlistEntry {
  module: string;
  reason: string;
}

const TIMESTAMP_ALLOWLIST: TimestampAllowlistEntry[] = [
  {
    module: "packages/os/site-kernel-checks/src/agent/agent-surface-sign.ts",
    reason:
      "Ed25519 signing proof `created` timestamp — deterministic per RFC-0308, not a generated file field.",
  },
  {
    module: "packages/os/site-kernel-checks/src/surface-breaker.ts",
    reason: "Breaker verdict `evaluatedAt` — operational state, not a generated file field.",
  },
  {
    module: "packages/os/site-kernel-codegen/src/open-source-page.ts",
    reason: "process.env.BUILD_TIMESTAMP fallback — CI build metadata, not new Date().",
  },
];

// ---------------------------------------------------------------------------
// Volatile timestamp patterns
// ---------------------------------------------------------------------------

const VOLATILE_PATTERNS: RegExp[] = [
  /new Date\(\)\.toISOString\(\)/,
  /new Date\(\)/,
  /Date\.now\(\)/,
  /process\.env\.BUILD_TIMESTAMP/,
];

const RULE_ID = "TS-TIME-01";

// ---------------------------------------------------------------------------
// Comment / string-literal exclusion
// ---------------------------------------------------------------------------

/**
 * Strip comments and string literals from a line so that timestamp patterns
 * inside them are not flagged. Handles:
 * - Single-line comments (// ...)
 * - Block comment state (tracked across lines via `inBlockComment`)
 * - String literals ('...', "...", `...`)
 */
export function stripCommentsAndStrings(line: string, state: { inBlockComment: boolean }): string {
  let result = "";
  let i = 0;
  const len = line.length;

  while (i < len) {
    // Inside block comment — look for closing */
    if (state.inBlockComment) {
      if (line[i] === "*" && i + 1 < len && line[i + 1] === "/") {
        state.inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Single-line comment — rest of line is comment
    if (line[i] === "/" && i + 1 < len && line[i + 1] === "/") {
      break;
    }

    // Block comment start
    if (line[i] === "/" && i + 1 < len && line[i + 1] === "*") {
      state.inBlockComment = true;
      i += 2;
      continue;
    }

    // String literals — skip to closing quote
    const ch = line[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i++;
      while (i < len) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === ch) {
          i++;
          break;
        }
        i++;
      }
      result += " ";
      continue;
    }

    result += line[i];
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 1: Source lint
// ---------------------------------------------------------------------------

export function scanModuleForTimestamps(
  modulePath: string,
  workspaceRoot: string,
): { line: number; pattern: string }[] {
  const absPath = join(workspaceRoot, modulePath);
  let content: string;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  const violations: { line: number; pattern: string }[] = [];
  const lines = content.split("\n");
  const state = { inBlockComment: false };

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsAndStrings(lines[i], state);
    for (const pattern of VOLATILE_PATTERNS) {
      if (pattern.test(stripped)) {
        violations.push({ line: i + 1, pattern: pattern.source });
      }
    }
  }

  return violations;
}

export function runPhase1(workspaceRoot: string, mode: "warning" | "fail"): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Collect unique module paths from ownership map
  const modulePaths = new Set<string>();
  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    if (entry.module) {
      modulePaths.add(entry.module);
    }
  }

  const allowlistModules = new Set(TIMESTAMP_ALLOWLIST.map((e) => e.module));

  for (const modulePath of modulePaths) {
    const isAllowlisted = allowlistModules.has(modulePath);
    const violations = scanModuleForTimestamps(modulePath, workspaceRoot);

    if (isAllowlisted) {
      // Report as info-severity exemption
      const allowEntry = TIMESTAMP_ALLOWLIST.find((e) => e.module === modulePath);
      if (violations.length > 0) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "info",
          message: `Allowlisted timestamp usage in ${modulePath}: ${allowEntry?.reason ?? "allowlisted"}`,
          file: modulePath,
        });
      }
      continue;
    }

    for (const v of violations) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: mode === "warning" ? "warning" : "error",
        message: `Volatile timestamp pattern "${v.pattern}" at ${modulePath}:${v.line} — use deterministic timestamp (e.g. process.env.BUILD_TIMESTAMP or a fixed value).`,
        file: modulePath,
        line: v.line,
        fixHint: `Replace with a deterministic timestamp source. See RFC-0602 for guidance.`,
      });
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Phase 2: Double-build drift detection
// ---------------------------------------------------------------------------

async function runPhase2(
  context: KernelRuntimeContext,
  mode: "warning" | "fail",
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  const buildOpts = {
    workspaceRoot: context.workspaceRoot,
    pipelineName: "build.prepare",
  };

  // Run build.prepare twice
  const run1 = (await executeKernelPipeline(buildOpts)) as { filesModified?: string[] };
  const run2 = (await executeKernelPipeline(buildOpts)) as { filesModified?: string[] };

  const files1 = new Set(run1?.filesModified ?? []);
  const files2 = new Set(run2?.filesModified ?? []);

  // Files that changed between the two runs have non-deterministic content.
  // Symmetric difference: files in one run but not the other.
  const drifted = new Set<string>();
  for (const file of files1) {
    if (!files2.has(file)) drifted.add(file);
  }
  for (const file of files2) {
    if (!files1.has(file)) drifted.add(file);
  }

  for (const file of drifted) {
    diagnostics.push({
      ruleId: RULE_ID,
      severity: mode === "warning" ? "warning" : "error",
      message: `Generated file "${file}" drifted between two consecutive build.prepare runs — contains non-deterministic content (likely a volatile timestamp).`,
      file,
      data: { phase: 2, field: "timestamp" },
      fixHint: `Find the volatile timestamp in the generator source and replace with a deterministic value. Run generated.timestamp.validate (without --deep) to identify the source pattern.`,
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function runGeneratedTimestampValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const deep = input.flags?.deep === true;
  const mode = (input.flags?.mode as string) === "fail" ? "fail" : "warning";

  const diagnostics: Diagnostic[] = [];

  // Phase 1 always runs
  diagnostics.push(...runPhase1(context.workspaceRoot, mode));

  // Phase 2 only when --deep is passed
  if (deep) {
    diagnostics.push(...(await runPhase2(context, mode)));
  }

  return diagnosticsResult("generated.timestamp.validate", diagnostics);
}
