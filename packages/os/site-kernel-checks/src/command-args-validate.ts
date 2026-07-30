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
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
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
import { stripCommentsAndStrings } from "./generated-timestamp-validate.ts";
import { diagnosticsResult } from "./result-helpers.ts";

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

const IGNORED_DIRS = new Set([
  ".astro",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "tests",
]);

const INPUT_ARGS_PATTERN = /\binput\.args\b/;
const DUAL_PATH_PATTERNS: RegExp[] = [
  /\?\?\s*input\.args\[/,
  /\|\|\s*input\.args\[/,
];
const NAMED_FLAG_READ_PATTERN =
  /\binput(?:\.|\?\.)flags\s*\[\s*["']([a-zA-Z0-9_-]+)["']\s*\]/g;

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

async function collectTsFiles(
  workspaceRoot: string,
  relativeDir: string,
): Promise<string[]> {
  const absoluteDir = join(workspaceRoot, relativeDir);
  const files: string[] = [];

  async function visit(currentAbsoluteDir: string, currentRelativeDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentAbsoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await visit(
          join(currentAbsoluteDir, entry.name),
          `${currentRelativeDir}/${entry.name}`,
        );
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".pbt.test.ts")) continue;
      files.push(toPosixPath(`${currentRelativeDir}/${entry.name}`));
    }
  }

  await visit(absoluteDir, relativeDir);
  return files;
}

// ---------------------------------------------------------------------------
// Command-table handler tracing (adapted from kernel-flags-lint.ts)
// ---------------------------------------------------------------------------

function extractObjectBlock(source: string, markerIndex: number): string | undefined {
  const start = source.lastIndexOf("{", markerIndex);
  if (start === -1) return undefined;

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return undefined;
}

function extractCommandTableHandlers(
  source: string,
): Array<{ command: string; functionName: string }> {
  const handlers: Array<{ command: string; functionName: string }> = [];
  const namePattern = /name:\s*"([^"]+)"/g;

  for (const match of source.matchAll(namePattern)) {
    const command = match[1];
    if (!command || match.index === undefined) continue;

    const block = extractObjectBlock(source, match.index);
    if (!block) continue;

    const executeMatch = block.match(/\bexecute:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    const functionName = executeMatch?.[1];
    if (!functionName) continue;

    handlers.push({ command, functionName });
  }

  return handlers;
}

function extractFunctionBody(source: string, functionName: string): string | undefined {
  const marker = `function ${functionName}(`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return undefined;
  const braceStart = source.indexOf("{", markerIndex);
  if (braceStart === -1) return undefined;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, index + 1);
    }
  }
  return source.slice(braceStart);
}

async function indexFunctionSources(
  workspaceRoot: string,
  functionNames: Set<string>,
): Promise<Map<string, string>> {
  const sourcesByFunction = new Map<string, Set<string>>();
  const candidateFiles = await collectTsFiles(workspaceRoot, "packages");
  const functionDeclarationPattern = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;

  for (const file of candidateFiles) {
    let source: string;
    try {
      source = await readFile(join(workspaceRoot, file), "utf8");
    } catch {
      continue;
    }

    for (const match of source.matchAll(functionDeclarationPattern)) {
      const functionName = match[1];
      if (!functionName || !functionNames.has(functionName)) continue;
      if (!extractFunctionBody(source, functionName)) continue;

      const files = sourcesByFunction.get(functionName) ?? new Set<string>();
      files.add(file);
      sourcesByFunction.set(functionName, files);
    }
  }

  const uniqueSources = new Map<string, string>();
  for (const [functionName, files] of sourcesByFunction) {
    if (files.size === 1) uniqueSources.set(functionName, [...files][0] ?? "");
  }
  return uniqueSources;
}

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

function scanFileForArgsViolations(
  file: string,
  workspaceRoot: string,
): SourceViolation[] {
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
          fix: "Remove the input.args[0] fallback and use input.flags[\"<name>\"] exclusively.",
        });
      } else {
        violations.push({
          rule: "ARG-COMPLIANCE-01",
          file,
          line: i + 1,
          message: `Handler reads input.args — the args field was removed from KernelCommandInput by RFC-0609.`,
          fix: "Use input.flags[\"<name>\"] instead of input.args[0].",
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Detection: ARG-COMPLIANCE-02
// ---------------------------------------------------------------------------

function hasEmptyFlags(flags: Record<string, unknown> | undefined): boolean {
  if (!flags) return true;
  return Object.keys(flags).length === 0;
}

function extractNamedFlagReads(body: string): Set<string> {
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
    allFiles.push(...(await collectTsFiles(workspaceRoot, dir)));
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
    const commandTableFiles = await collectTsFiles(workspaceRoot, COMMAND_TABLES_DIR);
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
