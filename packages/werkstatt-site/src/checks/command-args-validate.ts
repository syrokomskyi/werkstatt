/*
<MODULE_CONTRACT>
<purpose>
RFC-0610: static analysis enforcement for the flag-only command argument
pattern established by RFC-0609. Scans command registrations and handler
source code for three violation rules:
  ARG-COMPLIANCE-01 — handler reads removed input.args field
  ARG-COMPLIANCE-02 — command registered with empty flags but handler reads named flag
  ARG-COMPLIANCE-03 — handler uses dual-path fallback with input.args[0]
</purpose>
<non-goals>
  <item>Do not validate flag naming conventions — each domain may use its own flag name.</item>
  <item>Do not validate flag descriptions or help text quality.</item>
  <item>Do not catch `as any` escape hatches — the `no-as-any` ESLint rule is the first line of defense.</item>
  <item>Do not parse TypeScript with a real AST — regex scanning with comment/string exclusion is sufficient.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0610: initial implementation.</item>
  <item>RFC-0645: inlined stripCommentsAndStrings (moved from generated-timestamp-validate.ts before deletion).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { listRegisteredKernelCommands } from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import {
  collectTsFiles,
  extractCommandTableHandlers,
  extractFunctionBody,
  indexFunctionSources,
} from "./lib/command-table-tracing.ts";

// ---------------------------------------------------------------------------
// Comment / string-literal exclusion (inlined from generated-timestamp-validate.ts, RFC-0645)
// ---------------------------------------------------------------------------

/**
 * Strip comments and string literals from a line so that patterns
 * inside them are not flagged. Handles:
 * - Single-line comments (// ...)
 * - Block comment state (tracked across lines via `inBlockComment`)
 * - String literals ('...', "...", `...`)
 */
function stripCommentsAndStrings(line: string, state: { inBlockComment: boolean }): string {
  let result = "";
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (state.inBlockComment) {
      if (line[i] === "*" && i + 1 < len && line[i + 1] === "/") {
        state.inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (line[i] === "/" && i + 1 < len && line[i + 1] === "/") {
      break;
    }

    if (line[i] === "/" && i + 1 < len && line[i + 1] === "*") {
      state.inBlockComment = true;
      i += 2;
      continue;
    }

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
// Scan configuration
// ---------------------------------------------------------------------------

const SCAN_DIRS = [
  "packages/forge/os",
  "packages/os/site-kernel/src",
  "packages/os/site-kernel-checks/src",
  "packages/os/site-kernel-codegen/src",
  "packages/os/site-kernel-content/src",
  "packages/os/site-kernel-handoff/src",
  "packages/os/site-kernel-integrity/src",
  "packages/os/site-kernel-onboarding/src",
  "packages/os/site-kernel-observability/src",
];

const COMMAND_TABLES_DIR = "packages/os/site-kernel-checks/src/command-tables";

const IGNORED_DIRS = new Set([".astro", ".turbo", "coverage", "dist", "node_modules", "tests"]);

const INPUT_ARGS_PATTERN = /\binput\.args\b/;
const DUAL_PATH_PATTERNS: RegExp[] = [/\?\?\s*input\.args\[/, /\|\|\s*input\.args\[/];
const NAMED_FLAG_READ_PATTERN = /\binput(?:\.|\?\.)flags\s*\[\s*["']([a-zA-Z0-9_-]+)["']\s*\]/g;

// ---------------------------------------------------------------------------
// Detection: ARG-COMPLIANCE-01 and ARG-COMPLIANCE-03
// ---------------------------------------------------------------------------

interface SourceViolation {
  rule: "ARG-COMPLIANCE-01" | "ARG-COMPLIANCE-03";
  file: string;
  line: number;
  message: string;
  fix: string;
}

export function scanFileForArgsViolations(file: string, workspaceRoot: string): SourceViolation[] {
  const absPath = join(workspaceRoot, file);
  let content: string;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    return [];
  }

  const violations: SourceViolation[] = [];
  const lines = content.split("\n");
  const state = { inBlockComment: false };

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsAndStrings(lines[i], state);

    if (INPUT_ARGS_PATTERN.test(stripped)) {
      const isDualPath = DUAL_PATH_PATTERNS.some((p) => p.test(stripped));
      if (isDualPath) {
        violations.push({
          rule: "ARG-COMPLIANCE-03",
          file,
          line: i + 1,
          message: `Handler uses dual-path fallback with input.args[0] — prohibited by RFC-0609.`,
          fix: 'Remove the input.args[0] fallback and use input.flags["<name>"] exclusively.',
        });
      } else {
        violations.push({
          rule: "ARG-COMPLIANCE-01",
          file,
          line: i + 1,
          message: `Handler reads input.args — the args field was removed from KernelCommandInput by RFC-0609.`,
          fix: 'Use input.flags["<name>"] instead of input.args[0].',
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Detection: ARG-COMPLIANCE-02
// ---------------------------------------------------------------------------

export function hasEmptyFlags(flags: Record<string, unknown> | undefined): boolean {
  if (!flags) return true;
  return Object.keys(flags).length === 0;
}

export function extractNamedFlagReads(body: string): Set<string> {
  const flags = new Set<string>();
  for (const match of body.matchAll(NAMED_FLAG_READ_PATTERN)) {
    const name = match[1];
    if (name) flags.add(name);
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function runCommandArgsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const diagnostics: Diagnostic[] = [];

  // --- ARG-COMPLIANCE-01 & ARG-COMPLIANCE-03: scan all handler source files ---

  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...(await collectTsFiles(workspaceRoot, dir, IGNORED_DIRS)));
  }

  for (const file of allFiles) {
    const violations = scanFileForArgsViolations(file, workspaceRoot);
    for (const v of violations) {
      diagnostics.push({
        ruleId: v.rule,
        severity: "error",
        file: v.file,
        line: v.line,
        message: v.message,
        fixHint: v.fix,
      });
    }
  }

  // --- ARG-COMPLIANCE-02: commands with empty flags whose handler reads named flags ---

  const registered = await listRegisteredKernelCommands(workspaceRoot);
  const emptyFlagsCommands = registered.filter((c) => hasEmptyFlags(c.flags));
  const emptyFlagsCommandNames = new Set(emptyFlagsCommands.map((c) => c.name));

  if (emptyFlagsCommandNames.size > 0) {
    // Trace handler sources via command tables
    const commandTableFiles = await collectTsFiles(workspaceRoot, COMMAND_TABLES_DIR, IGNORED_DIRS);
    const tableHandlers: Array<{ command: string; functionName: string }> = [];
    const functionNames = new Set<string>();

    for (const file of commandTableFiles) {
      let source: string;
      try {
        source = await readFile(join(workspaceRoot, file), "utf8");
      } catch {
        continue;
      }

      for (const handler of extractCommandTableHandlers(source)) {
        if (!emptyFlagsCommandNames.has(handler.command)) continue;
        tableHandlers.push(handler);
        functionNames.add(handler.functionName);
      }
    }

    const sourceByFunction = await indexFunctionSources(workspaceRoot, functionNames);

    for (const handler of tableHandlers) {
      const handlerFile = sourceByFunction.get(handler.functionName);
      if (!handlerFile) continue;

      let source: string;
      try {
        source = await readFile(join(workspaceRoot, handlerFile), "utf8");
      } catch {
        continue;
      }

      const body = extractFunctionBody(source, handler.functionName);
      if (!body) continue;

      const namedFlagReads = extractNamedFlagReads(body);
      if (namedFlagReads.size === 0) continue;

      for (const flagName of namedFlagReads) {
        diagnostics.push({
          ruleId: "ARG-COMPLIANCE-02",
          severity: "error",
          file: handlerFile,
          message: `${handler.command} declares flags: {} but handler reads input.flags["${flagName}"] — add the flag to the schema.`,
          fixHint: `Add "${flagName}" to the flags schema for ${handler.command} in its command-table registration.`,
          data: { command: handler.command, flagName },
        });
      }
    }
  }

  return diagnosticsResult("command.args.validate", diagnostics);
}
