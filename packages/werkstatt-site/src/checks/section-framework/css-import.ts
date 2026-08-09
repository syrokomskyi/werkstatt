/*
<MODULE_CONTRACT>
<purpose>section.css.import.validate (CSS-IMPORT-01 + CSS-NAME-01) — every colocated
.css file under packages/ui/src/ must be imported by an .astro file and match the
colocated .astro filename.</purpose>
<non-goals>
  <item>Do not validate CSS content or token usage — owned by tokens.colors.section-shell.lint.</item>
  <item>Do not validate section manifest structure — owned by section.shell.contract.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0598: created validator for colocated CSS import integrity.</item>
  <item>RFC-0598: refactored per fo-review — extracted collectByExtension and isImportedBy helpers, removed dead code.</item>
</CHANGE_SUMMARY>
*/

import { join, relative, basename, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { ok, fail, type Violation, type CheckResult } from "./shared.ts";

const UI_DIRS = [
  join("packages", "ui", "src", "sections"),
  join("packages", "ui", "src", "components"),
];

async function collectByExtension(workspaceRoot: string, extension: string): Promise<string[]> {
  const results = await Promise.all(
    UI_DIRS.map((dir) =>
      collectFiles(join(workspaceRoot, dir), {
        extensions: [extension],
        ignore: () => false,
      }),
    ),
  );
  return results.flat();
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function isImportedBy(cssBasename: string, astroText: string): boolean {
  const escaped = cssBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`import\\s+["']\\.\\.?/[^"']*${escaped}["']`).test(astroText);
}

export async function runSectionCssImportValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.css.import.validate";
  const violations: Violation[] = [];

  const cssFiles = await collectByExtension(context.workspaceRoot, ".css");
  const astroFiles = await collectByExtension(context.workspaceRoot, ".astro");

  const astroContents = await Promise.all(
    astroFiles.map(async (file) => ({
      file,
      text: await readFile(file, "utf-8"),
    })),
  );

  for (const cssFile of cssFiles) {
    const cssRel = relative(context.workspaceRoot, cssFile).replace(/\\/g, "/");
    const cssBasename = basename(cssFile);
    const cssDir = dirname(cssFile);

    const imported = astroContents.some((a) => isImportedBy(cssBasename, a.text));

    if (!imported) {
      violations.push({
        file: cssRel,
        rule: "CSS-IMPORT-01",
        message: `CSS file '${cssBasename}' is not imported by any .astro file in packages/ui/src/`,
        fix: `Add import "./${cssBasename}" to the colocated .astro file.`,
      });
    }

    const astroInSameDir = astroFiles.filter((f) => dirname(f) === cssDir);

    if (astroInSameDir.length > 0) {
      const cssStem = stripExt(cssBasename);
      const hasMatchingAstro = astroInSameDir.some((f) => {
        const astroStem = stripExt(basename(f));
        return astroStem === cssStem;
      });

      const importedBySameDirAstro = astroContents.some(
        (a) => dirname(a.file) === cssDir && isImportedBy(cssBasename, a.text),
      );

      if (!hasMatchingAstro && !importedBySameDirAstro) {
        const _astroRel = relative(context.workspaceRoot, astroInSameDir[0]).replace(/\\/g, "/");
        const astroBasename = basename(astroInSameDir[0]);
        violations.push({
          file: cssRel,
          rule: "CSS-NAME-01",
          message: `CSS filename '${cssBasename}' does not match colocated .astro filename '${astroBasename}'`,
          fix: `Rename '${cssBasename}' to '${stripExt(astroBasename)}.css' or rename '${astroBasename}' to '${cssStem}.astro'.`,
        });
      }
    }
  }

  if (violations.length === 0) return ok(cmd);
  return fail(cmd, violations);
}
