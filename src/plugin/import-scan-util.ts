/*
<MODULE_CONTRACT>
<purpose>Shared utility for scanning TypeScript source files for import specifiers
matching a pattern. Used by both autonomy-validate.ts and shared-validate.ts to
avoid code duplication (Fowler: Duplicated Code).</purpose>
<keywords>scan, import, utility, shared, validate, autonomy</keywords>
<non-goals>
  <item>Does not define what is forbidden or exempt — callers provide the pattern and filter.</item>
  <item>Does not scan test files — .test.ts and .spec.ts are always excluded.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: extract shared directory-scanning utility from autonomy-validate and shared-validate.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ImportViolation {
  file: string;
  specifier: string;
}

const EXCLUDE_DIRS = new Set(["node_modules", "tests", "tests-handoff", "dist", "templates"]);
const EXCLUDE_SUFFIXES = [".test.ts", ".spec.ts"];

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import\s+(?:type\s+)?[^;]+?\s+from\s+|require\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function shouldExcludeFile(fileName: string): boolean {
  return EXCLUDE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

export async function scanDirectoryForImports(
  dir: string,
  workspaceRoot: string,
  specifierFilter: (specifier: string) => boolean,
): Promise<{ violations: ImportViolation[]; scannedFiles: number }> {
  let scannedFiles = 0;
  const violations: ImportViolation[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const subResult = await scanDirectoryForImports(fullPath, workspaceRoot, specifierFilter);
      scannedFiles += subResult.scannedFiles;
      violations.push(...subResult.violations);
    } else if (entry.name.endsWith(".ts") && !shouldExcludeFile(entry.name)) {
      scannedFiles++;
      const content = await readFile(fullPath, "utf8").catch(() => "");
      let match: RegExpExecArray | null;
      const pattern = new RegExp(IMPORT_PATTERN.source, "g");
      while ((match = pattern.exec(content)) !== null) {
        const specifier = match[1]!;
        if (specifierFilter(specifier)) {
          violations.push({
            file: relative(workspaceRoot, fullPath),
            specifier,
          });
        }
      }
    }
  }

  return { violations, scannedFiles };
}
