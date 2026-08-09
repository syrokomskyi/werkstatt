/*
<MODULE_CONTRACT>
<purpose>
RFC-0557: template.imports.validate — auto-discovers all template files across
workspace packages, extracts @warpgogol/* and @warpgogol/* import specifiers
(both static `from "..."` and dynamic `import("...")` patterns), and verifies
each resolved package name exists in root package.json devDependencies.
Additionally runs `pnpm install --frozen-lockfile` to detect lockfile drift
and unsatisfied peer dependencies.
</purpose>
<non-goals>
  <item>Does not validate workpiece imports — that is workpiece.imports.validate.</item>
  <item>Does not validate third-party peer dependencies — delegated to pnpm install --frozen-lockfile.</item>
  <item>Does not validate version compatibility of isomorphic packages.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0557: initial implementation of template.imports.validate.</item>
</CHANGE_SUMMARY>
*/

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { collectFiles, fileExists } from "@warpgogol/werkstatt-site/share/fs";
import { discoverWorkspacePackages } from "@warpgogol/site-kernel";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const execFileAsync = promisify(execFile);

const COMMAND = "template.imports.validate";

/** Regex matching static `from "@warpgogol/..."` / `from "@warpgogol/..."` imports. */
const STATIC_IMPORT_RE = /from\s+["'](@(?:warpgogol|warpgogol)\/[^"']+)["']/g;

/** Regex matching dynamic `import("@warpgogol/...")` / `import("@warpgogol/...")` imports. */
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["'](@(?:warpgogol|warpgogol)\/[^"']+)["']/g;

export interface TemplateImportsValidateData extends CheckResult {
  templatesScanned: number;
  importsFound: Array<{
    package: string;
    file: string;
    line: number;
  }>;
  missingFromRootDeps: Array<{
    package: string;
    importedBy: string[];
  }>;
  frozenLockfileOk: boolean;
  frozenLockfileError?: string;
}

interface TemplateImport {
  package: string;
  file: string;
  line: number;
}

/** Normalize an import specifier to its package name (e.g. @warpgogol/werkstatt-site/share/fs → @warpgogol/werkstatt-site/share). */
function normalizePackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

/** Extract @warpgogol/* and @warpgogol/* import specifiers from source text. */
export function extractWorkspaceImports(source: string, filePath: string): TemplateImport[] {
  const results: TemplateImport[] = [];
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        results.push({ package: normalizePackageName(match[1]), file: filePath, line: i + 1 });
      }
    }
  }

  return results;
}

function hasFlag(input: KernelCommandInput, name: string): boolean {
  if (input.flags[name] === true) return true;
  return false;
}

export async function runTemplateImportsValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<TemplateImportsValidateData>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;
  const skipFrozenLockfile = hasFlag(input, "no-frozen-lockfile");
  const dryRun = hasFlag(input, "dry-run");

  // ── Discover workspace packages ────────────────────────────────────────────
  const { packages: workspacePackages } = await discoverWorkspacePackages(workspaceRoot);

  // ── Auto-discover template files ────────────────────────────────────────────
  const templateFiles: string[] = [];
  for (const pkg of workspacePackages) {
    const templatesDir = join(pkg.absoluteDirectory, "src", "templates");
    if (!(await fileExists(templatesDir))) continue;
    const files = await collectFiles(templatesDir, {
      ignore: (name) => name.startsWith("-") || name.startsWith("old-") || name === "node_modules",
    });
    for (const f of files) {
      if (/\.(template)\.[^/]+$/.test(f)) {
        templateFiles.push(f);
      }
    }
  }

  // ── Extract imports from all template files ─────────────────────────────────
  const allImports: TemplateImport[] = [];
  for (const absPath of templateFiles) {
    let content: string;
    try {
      content = await readFile(absPath, "utf-8");
    } catch {
      continue;
    }
    const relPath = relative(workspaceRoot, absPath).replace(/\\/g, "/");
    const imports = extractWorkspaceImports(content, relPath);
    allImports.push(...imports);
  }

  // ── Read root package.json devDependencies ──────────────────────────────────
  let rootDevDeps: Set<string>;
  try {
    const rootPkgRaw = await readFile(join(workspaceRoot, "package.json"), "utf-8");
    const rootPkg = JSON.parse(rootPkgRaw) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    rootDevDeps = new Set([
      ...Object.keys(rootPkg.devDependencies ?? {}),
      ...Object.keys(rootPkg.dependencies ?? {}),
    ]);
  } catch {
    diagnostics.push({
      ruleId: "TEMPLATE-IMPORTS-01",
      severity: "error",
      file: "package.json",
      message: "Could not read or parse root package.json.",
      fixHint: "Ensure package.json exists and is valid JSON.",
    });
    return diagnosticsResult(
      COMMAND,
      diagnostics,
    ) as KernelCommandResult<TemplateImportsValidateData>;
  }

  // ── Check each imported package against root devDependencies ─────────────────
  const missingByPackage = new Map<string, string[]>();
  for (const imp of allImports) {
    if (!rootDevDeps.has(imp.package)) {
      const existing = missingByPackage.get(imp.package) ?? [];
      if (!existing.includes(imp.file)) {
        existing.push(imp.file);
      }
      missingByPackage.set(imp.package, existing);
    }
  }

  for (const [pkg, importedBy] of missingByPackage) {
    diagnostics.push({
      ruleId: "TEMPLATE-IMPORTS-01",
      severity: "error",
      message: `Package '${pkg}' is imported by ${importedBy.length} template file(s) but is not in root package.json devDependencies.`,
      fixHint: `Add "${pkg}": "workspace:*" to root package.json devDependencies and run pnpm install`,
      data: { package: pkg, importedBy },
    });
  }

  // ── Run pnpm install --frozen-lockfile ──────────────────────────────────────
  let frozenLockfileOk = true;
  let frozenLockfileError: string | undefined;

  if (!skipFrozenLockfile) {
    try {
      await execFileAsync("pnpm", ["install", "--frozen-lockfile"], {
        cwd: workspaceRoot,
        env: process.env,
      });
    } catch (err) {
      frozenLockfileOk = false;
      const message = err instanceof Error ? err.message : String(err);
      frozenLockfileError = message;
      diagnostics.push({
        ruleId: "TEMPLATE-IMPORTS-02",
        severity: "error",
        message: `pnpm install --frozen-lockfile failed: ${message}`,
        fixHint: "Run pnpm install to sync the lockfile, then commit pnpm-lock.yaml.",
      });
    }
  }

  const result = diagnosticsResult(COMMAND, diagnostics);
  const data: TemplateImportsValidateData = {
    command: COMMAND,
    status: result.data?.status ?? "pass",
    diagnostics: result.data?.diagnostics ?? [],
    summary: result.data?.summary ?? { error: 0, warning: 0, info: 0 },
    templatesScanned: templateFiles.length,
    importsFound: allImports,
    missingFromRootDeps: Array.from(missingByPackage.entries()).map(([pkg, importedBy]) => ({
      package: pkg,
      importedBy,
    })),
    frozenLockfileOk,
    ...(frozenLockfileError ? { frozenLockfileError } : {}),
  };

  return {
    data,
    exitCode: dryRun ? 0 : result.exitCode,
    summary: result.summary,
  };
}
