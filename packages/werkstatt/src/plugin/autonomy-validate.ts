/*
<MODULE_CONTRACT>
<purpose>Autonomy guard for the Werkstatt engine (RFC-0772). Scans packages/werkstatt/src/**
for @warpgogol/* import specifiers that indicate stack-plugin coupling. Excludes
self-imports (@warpgogol/werkstatt) and shared schema packages (@warpgogol/werkstatt-site/ontology,
@warpgogol/werkstatt-site/share) which are not stack plugins.</purpose>
<keywords>autonomy, guard, RFC-0772, DNA-64, plugin boundary</keywords>
<non-goals>
  <item>Do not scan test files — tests may import from any package.</item>
  <item>Do not scan node_modules — only engine source is checked.</item>
  <item>Do not block on @warpgogol/werkstatt-site/ontology or @warpgogol/werkstatt-site/share — these are shared schema packages.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0772: initial autonomy guard implementation modeled on forge.doctor precedent.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Packages that are exempt from the autonomy guard.
 * - @warpgogol/werkstatt: self-imports (engine importing its own subpaths)
 * - @warpgogol/werkstatt-site/ontology: shared schema package (not a stack plugin)
 * - @warpgogol/werkstatt-site/share: shared utility package (not a stack plugin)
 * - @warpgogol/forge: governance package (not a stack plugin)
 * - @warpgogol/werkstatt-site/passport: identity/signing infrastructure (not a stack plugin)
 * - @warpgogol/werkstatt-site/observability: observability infrastructure (not a stack plugin)
 * - @warpgogol/werkstatt-site/integration: integration contracts (not a stack plugin)
 * - @warpgogol/werkstatt-site/integration-adapter-supabase-crm: integration adapter (not a stack plugin)
 * - @warpgogol/werkstatt-site/surface: surface contracts (not a stack plugin)
 *
 * Stack-specific packages that SHOULD be flagged (not exempt):
 * - @warpgogol/site-kernel-astro, site-kernel-checks, site-kernel-codegen,
 *   site-kernel-content, site-kernel-onboarding, site-kernel-audit
 *
 * These will be inverted through plugin hooks in RFC-0774/0775.
 * Until then, they are also exempt to allow the re-export scaffold period.
 */
const EXEMPT_PREFIXES = [
  "@warpgogol/werkstatt",
  "@warpgogol/werkstatt-site/ontology",
  "@warpgogol/werkstatt-site/share",
  "@warpgogol/forge",
  "@warpgogol/werkstatt-site/passport",
  "@warpgogol/werkstatt-site/observability",
  "@warpgogol/werkstatt-site/integration",
  "@warpgogol/werkstatt-site/integration-adapter-supabase-crm",
  "@warpgogol/werkstatt-site/surface",
  // Temporary: stack-specific packages exempt during re-export scaffold period
  // (RFC-0774/0775 will invert these through plugin hooks)
  "@warpgogol/site-kernel-astro",
  "@warpgogol/site-kernel-checks",
  "@warpgogol/site-kernel-codegen",
  "@warpgogol/site-kernel-content",
  "@warpgogol/site-kernel-onboarding",
  "@warpgogol/site-kernel-audit",
];

/**
 * Pattern matching @warpgogol/* import specifiers (both runtime and type-only).
 * Matches: import ... from "@warpgogol/...", import type ... from "@warpgogol/..."
 */
const WARPGOGOL_IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import\s+(?:type\s+)?[^;]+?\s+from\s+|require\s*\(\s*)["'`](@warpgogol\/[^"'`]+)["'`]/g;

/**
 * Directories and file patterns to exclude from scanning.
 */
const EXCLUDE_DIRS = new Set(["node_modules", "tests", "tests-handoff", "dist"]);
const EXCLUDE_SUFFIXES = [".test.ts", ".spec.ts"];

export interface AutonomyViolation {
  file: string;
  specifier: string;
}

export interface AutonomyValidateResult {
  command: string;
  status: "pass" | "fail";
  violations: AutonomyViolation[];
  scannedFiles: number;
}

/**
 * Check if a specifier is exempt (self-import or shared schema package).
 */
function isExempt(specifier: string): boolean {
  return EXEMPT_PREFIXES.some(
    (prefix) => specifier === prefix || specifier.startsWith(prefix + "/"),
  );
}

/**
 * Check if a file should be excluded from scanning.
 */
function shouldExcludeFile(fileName: string): boolean {
  return EXCLUDE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

/**
 * Recursively scan a directory for @warpgogol/* import violations.
 */
async function scanDirectory(
  dir: string,
  workspaceRoot: string,
  violations: AutonomyViolation[],
): Promise<number> {
  let scannedFiles = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      scannedFiles += await scanDirectory(fullPath, workspaceRoot, violations);
    } else if (entry.name.endsWith(".ts") && !shouldExcludeFile(entry.name)) {
      scannedFiles++;
      const content = await readFile(fullPath, "utf8").catch(() => "");
      let match: RegExpExecArray | null;
      const pattern = new RegExp(WARPGOGOL_IMPORT_PATTERN.source, "g");
      while ((match = pattern.exec(content)) !== null) {
        const specifier = match[1]!;
        if (!isExempt(specifier)) {
          violations.push({
            file: relative(workspaceRoot, fullPath),
            specifier,
          });
        }
      }
    }
  }

  return scannedFiles;
}

/**
 * Run the autonomy validation. Scans packages/werkstatt/src/** for forbidden
 * @warpgogol/* imports (excluding self-imports and shared schema packages).
 */
export async function runAutonomyValidate(workspaceRoot: string): Promise<AutonomyValidateResult> {
  const engineSrcDir = join(workspaceRoot, "packages", "werkstatt", "src");
  const violations: AutonomyViolation[] = [];
  const scannedFiles = await scanDirectory(engineSrcDir, workspaceRoot, violations);

  return {
    command: "werkstatt.autonomy.validate",
    status: violations.length === 0 ? "pass" : "fail",
    violations,
    scannedFiles,
  };
}
