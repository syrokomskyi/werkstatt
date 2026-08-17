/*
<MODULE_CONTRACT>
<purpose>Boundary guard for @warpgogol/werkstatt-shared (RFC-0868). Scans
packages/werkstatt-shared/src/** for @warpgogol/werkstatt-site imports that
indicate stack-plugin coupling. The shared package MUST NOT depend on the
site plugin — only on @warpgogol/werkstatt (engine) and external packages.</purpose>
<keywords>shared, validate, RFC-0868, boundary guard</keywords>
<non-goals>
  <item>Do not scan test files — tests may import from any package.</item>
  <item>Do not scan node_modules — only shared source is checked.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: initial shared-package boundary guard.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const FORBIDDEN_PREFIX = "@warpgogol/werkstatt-site";

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import\s+(?:type\s+)?[^;]+?\s+from\s+|require\s*\(\s*)["'`](@warpgogol\/werkstatt-site[^"'`]*)["'`]/g;

const EXCLUDE_DIRS = new Set(["node_modules", "tests", "dist"]);
const EXCLUDE_SUFFIXES = [".test.ts", ".spec.ts"];

export interface SharedViolation {
  file: string;
  specifier: string;
}

export interface SharedValidateResult {
  command: string;
  status: "pass" | "fail";
  violations: SharedViolation[];
  scannedFiles: number;
}

function shouldExcludeFile(fileName: string): boolean {
  return EXCLUDE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

async function scanDirectory(
  dir: string,
  workspaceRoot: string,
  violations: SharedViolation[],
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
      const pattern = new RegExp(IMPORT_PATTERN.source, "g");
      while ((match = pattern.exec(content)) !== null) {
        violations.push({
          file: relative(workspaceRoot, fullPath),
          specifier: match[1]!,
        });
      }
    }
  }

  return scannedFiles;
}

export async function runSharedValidate(
  workspaceRoot: string,
): Promise<SharedValidateResult> {
  const sharedSrcDir = join(workspaceRoot, "packages", "werkstatt-shared", "src");
  const violations: SharedViolation[] = [];
  const scannedFiles = await scanDirectory(sharedSrcDir, workspaceRoot, violations);

  return {
    command: "werkstatt.shared.validate",
    status: violations.length === 0 ? "pass" : "fail",
    violations,
    scannedFiles,
  };
}
