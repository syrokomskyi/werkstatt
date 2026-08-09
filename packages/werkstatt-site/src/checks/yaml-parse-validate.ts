/*
<MODULE_CONTRACT>
<purpose>
  yaml.parse.validate — RFC-0493: parse-check all .yaml files in the workspace
  using the yaml (Eemeli AY) library. Reports parse errors (YAML-PARSE-01) and
  duplicate mapping keys (YAML-PARSE-02). Uses a reduced exclude set compared
  to yaml.contract.lint so that .yaml files in packages/, missions/, systems/,
  docs/, services/, integrations/, and fleet/ are also validated.
</purpose>
<non-goals>
  <item>Do not validate YAML schema correctness — only parse validity and duplicate-key detection.</item>
  <item>Do not rewrite offending files — this is a read-only validation command.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0493: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { relative } from "node:path";
import { parseAllDocuments, isMap, isSeq, isScalar } from "yaml";
import type { Node } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

/**
 * Reduced exclude set — does NOT exclude `packages`, `missions`, `systems`,
 * `docs`, `services`, `integrations`, or `fleet` because those directories
 * contain authored .yaml files that need parse validation. Only build artifacts
 * and tool-managed directories are excluded.
 */
const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".cache",
  ".output",
  ".astro",
  ".turbo",
  ".agents",
  ".changelog-system",
  ".claude",
  ".github",
  ".vscode",
  ".windsurf",
  ".wrangler",
  ".opencode",
  ".werkstatt",
  "scripts",
  "tmp",
  "releases",
  "agents",
  "logs",
  "coverage",
  "out",
]);

function makeIgnore(excludeDirs: Set<string>): (name: string) => boolean {
  return (name: string) => excludeDirs.has(name) || name.startsWith("-") || name.startsWith("old-");
}

/**
 * Extract a line number from a YAML parse error. The `yaml` library reports
 * errors with `linePos` (array of { line, col }) or a `pos` character offset.
 * Returns the first available line number, or undefined.
 */
function extractLinePos(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    if (Array.isArray(err["linePos"]) && err["linePos"].length > 0) {
      const first = err["linePos"][0] as Record<string, unknown>;
      if (typeof first["line"] === "number") return first["line"];
    }
    if (typeof err["line"] === "number") return err["line"];
  }
  return undefined;
}

/**
 * Convert a character offset to a 1-based line number.
 */
function offsetToLine(raw: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < raw.length; i++) {
    if (raw[i] === "\n") line++;
  }
  return line;
}

interface DuplicateKey {
  key: string;
  line: number | undefined;
}

/**
 * Walk a YAML document tree and find duplicate mapping keys.
 * Recursively visits maps and sequences to detect duplicates at any nesting level.
 */
function findDuplicateKeys(
  node: Node | null | undefined,
  raw: string,
  path: string[] = [],
): DuplicateKey[] {
  const duplicates: DuplicateKey[] = [];

  if (isMap(node)) {
    const seen = new Set<string>();
    for (const pair of node.items) {
      const keyNode = pair.key;
      const keyStr = isScalar(keyNode) ? String(keyNode.value) : String(keyNode);
      if (seen.has(keyStr)) {
        const fullKey = [...path, keyStr].join(".");
        const range = (keyNode as { range?: [number, number, number] })?.range;
        const line = range ? offsetToLine(raw, range[0]) : undefined;
        duplicates.push({ key: fullKey, line });
      }
      seen.add(keyStr);
      if (pair.value) {
        duplicates.push(...findDuplicateKeys(pair.value as Node, raw, [...path, keyStr]));
      }
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      duplicates.push(...findDuplicateKeys(item as Node, raw, path));
    }
  }

  return duplicates;
}

export async function runYamlParseValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const root = context.workspaceRoot;

  const allFiles = await collectFiles(root, {
    extensions: [".yaml"],
    ignore: makeIgnore(EXCLUDE_DIRS),
  });

  for (const abs of allFiles) {
    const relPath = relative(root, abs).replace(/\\/g, "/");

    let raw: string;
    try {
      raw = await context.io.readFile(abs);
    } catch {
      continue;
    }

    // parseAllDocuments collects errors in doc.errors rather than throwing.
    // uniqueKeys: false preserves duplicate keys in the node tree so we can detect them.
    const docs = parseAllDocuments(raw, { uniqueKeys: false });

    let hasParseError = false;
    for (const doc of docs) {
      for (const err of doc.errors) {
        diagnostics.push({
          ruleId: "YAML-PARSE-01",
          severity: "error",
          file: relPath,
          line: extractLinePos(err),
          message: `YAML file failed to parse: ${err.message}`,
          fixHint: `Fix the syntax error in ${relPath}.`,
        });
        hasParseError = true;
      }
    }

    // Skip duplicate-key check if the file has parse errors — the tree may be incomplete.
    if (hasParseError) continue;

    for (const doc of docs) {
      const duplicates = findDuplicateKeys(doc.contents as Node | null, raw);
      for (const dup of duplicates) {
        diagnostics.push({
          ruleId: "YAML-PARSE-02",
          severity: "error",
          file: relPath,
          line: dup.line,
          message: `YAML file has duplicate mapping key: ${dup.key}`,
          fixHint: `Remove or rename the duplicate key in ${relPath}.`,
        });
      }
    }
  }

  return diagnosticsResult("yaml.parse.validate", diagnostics);
}
