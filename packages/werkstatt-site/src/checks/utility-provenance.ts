/*
<MODULE_CONTRACT>
<purpose>RFC-0916: utility provenance validator — scans packages TS files for reimplemented canonical utilities outside their canonical paths, using a YAML registry.</purpose>
<non-goals>
  <item>Do not define canonical utilities — those live in packages/werkstatt-shared/src/share/.</item>
  <item>Do not define pipeline placement — that lives in PACKAGES_CHECK_PIPELINE.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0916: initial implementation of utility.provenance.validate command.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { parse as yamlParse } from "yaml";

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  Diagnostic,
  CheckResult,
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

interface UtilityPattern {
  id: string;
  regex: string;
  description?: string;
}

interface UtilityEntry {
  id: string;
  canonicalPath: string;
  forbiddenImports: string[];
  functionNames: string[];
  patterns: UtilityPattern[];
  allowlist: Array<{ path: string; reason: string }>;
}

interface UtilityRegistry {
  utilities: UtilityEntry[];
}

async function loadRegistry(context: KernelRuntimeContext): Promise<UtilityRegistry | null> {
  try {
    const raw = await context.io.readFile(
      path.join(
        context.workspaceRoot,
        "packages",
        "werkstatt-shared",
        "src",
        "share",
        "utility-registry.yaml",
      ),
    );
    return yamlParse(raw) as UtilityRegistry;
  } catch {
    return null;
  }
}

function isAllowlisted(filePath: string, entry: UtilityEntry): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return entry.allowlist.some((allowed) => {
    const pattern = allowed.path.replace(/\\/g, "/");
    return normalized.includes(pattern);
  });
}

function isCanonicalPath(filePath: string, entry: UtilityEntry): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes(entry.canonicalPath.replace(/\\/g, "/"));
}

const IMPORT_RE = /(?:import\s+|require\s*\(\s*|from\s+)(["'][^"']+["'])/g;

function checkForbiddenImports(content: string, forbiddenImports: string[]): string[] {
  const found: string[] = [];
  const imports = [...content.matchAll(IMPORT_RE)].map((m) => m[1]!.replace(/["']/g, ""));
  for (const imp of imports) {
    for (const forbidden of forbiddenImports) {
      if (imp === forbidden || imp.startsWith(`${forbidden}/`)) {
        found.push(forbidden);
      }
    }
  }
  return [...new Set(found)];
}

const FUNCTION_DECL_RE = /(?:function\s+|const\s+|let\s+|var\s+)(\w+)\s*(?:\s*\(|=)/g;

function checkFunctionNames(content: string, functionNames: string[]): string[] {
  const found: string[] = [];
  const declarations = [...content.matchAll(FUNCTION_DECL_RE)].map((m) => m[1]!);
  for (const decl of declarations) {
    if (functionNames.includes(decl)) {
      found.push(decl);
    }
  }
  return [...new Set(found)];
}

function checkPatterns(
  content: string,
  patterns: UtilityPattern[],
  compiledRegexes: Map<string, RegExp>,
): UtilityPattern[] {
  const found: UtilityPattern[] = [];
  for (const pattern of patterns) {
    const regex = compiledRegexes.get(pattern.id);
    if (regex && regex.test(content)) {
      found.push(pattern);
    }
  }
  return found;
}

export async function runUtilityProvenanceValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const mode = (input.flags["mode"] as string | undefined) ?? "warning";
  const diagnostics: Diagnostic[] = [];

  const registry = await loadRegistry(context);
  if (!registry || !registry.utilities) {
    diagnostics.push({
      ruleId: "UTIL-REG-01",
      severity: "error",
      file: "packages/werkstatt-shared/src/share/utility-registry.yaml",
      message: "Utility registry missing or invalid YAML. Cannot validate utility provenance.",
      fixHint:
        "Create packages/werkstatt-shared/src/share/utility-registry.yaml with a 'utilities' array.",
    });
    return diagnosticsResult("utility.provenance.validate", diagnostics);
  }

  const compiledRegexes = new Map<string, RegExp>();
  for (const entry of registry.utilities) {
    for (const pattern of entry.patterns ?? []) {
      try {
        compiledRegexes.set(pattern.id, new RegExp(pattern.regex));
      } catch {
        diagnostics.push({
          ruleId: "UTIL-REG-02",
          severity: "error",
          file: "packages/werkstatt-shared/src/share/utility-registry.yaml",
          message: `Invalid regex in registry for pattern '${pattern.id}' (utility: ${entry.id}): ${pattern.regex}`,
          fixHint: "Fix the regex syntax in utility-registry.yaml.",
        });
      }
    }
  }
  if (diagnostics.length > 0) {
    return diagnosticsResult("utility.provenance.validate", diagnostics);
  }

  const packagesDir = path.join(context.workspaceRoot, "packages");
  const files = await collectFiles(packagesDir, {
    extensions: [".ts", ".tsx"],
  });

  for (const file of files) {
    const relPath = path.relative(context.workspaceRoot, file).replace(/\\/g, "/");

    const content = await context.io.readFile(file);

    for (const entry of registry.utilities) {
      if (isCanonicalPath(relPath, entry)) continue;
      if (isAllowlisted(relPath, entry)) continue;

      const forbiddenFound = checkForbiddenImports(content, entry.forbiddenImports ?? []);
      for (const imp of forbiddenFound) {
        diagnostics.push({
          ruleId: "UTIL-PROV-01",
          severity: "error",
          file: relPath,
          message: `Forbidden import '${imp}' outside canonical path '${entry.canonicalPath}'. Use @warpgogol/werkstatt-shared/share/${entry.id} instead.`,
          fixHint: `Import from @warpgogol/werkstatt-shared/share/${entry.id}, or add an allowlist entry with a reason in utility-registry.yaml.`,
        });
      }

      const functionsFound = checkFunctionNames(content, entry.functionNames ?? []);
      for (const fn of functionsFound) {
        diagnostics.push({
          ruleId: "UTIL-PROV-02",
          severity: "error",
          file: relPath,
          message: `Function name '${fn}' outside canonical path '${entry.canonicalPath}'. Use @warpgogol/werkstatt-shared/share/${entry.id} instead.`,
          fixHint: `Import from @warpgogol/werkstatt-shared/share/${entry.id}, or add an allowlist entry with a reason in utility-registry.yaml.`,
        });
      }

      const patternsFound = checkPatterns(content, entry.patterns ?? [], compiledRegexes);
      for (const pattern of patternsFound) {
        diagnostics.push({
          ruleId: "UTIL-PROV-03",
          severity: "error",
          file: relPath,
          message: `Pattern '${pattern.id}' detected outside canonical path '${entry.canonicalPath}': ${pattern.description ?? pattern.regex}`,
          fixHint: `Import from @warpgogol/werkstatt-shared/share/${entry.id}, or add an allowlist entry with a reason in utility-registry.yaml.`,
        });
      }
    }
  }

  if (mode === "warning") {
    const warnings = diagnostics.map((d) => ({ ...d, severity: "warning" as const }));
    return diagnosticsResult("utility.provenance.validate", warnings);
  }

  return diagnosticsResult("utility.provenance.validate", diagnostics);
}
