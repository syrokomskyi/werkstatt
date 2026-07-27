/*
<MODULE_CONTRACT>
<purpose>
Implements section.placeholder.lint — fails any section component in
packages/ui/src/sections that still renders pageOverride via
JSON.stringify, the section-scaffold stub. Shipping such a section
produces the raw-JSON-on-page failure mode (RFC-0093).
</purpose>
<non-goals>
  <item>Do not validate the actual rendered output — schema correctness lives in
        page.block.validate and the per-section propsSchema.</item>
  <item>Do not modify files — lint only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0093: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { collectFiles } from "@gogol/share/fs";

const STUB_PATTERN = /JSON\.stringify\s*\(\s*pageOverride/;

interface PlaceholderViolation {
  file: string;
  section: string;
}

async function collectSectionAstroFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    extensions: [".astro"],
    ignore: (name) => name === "node_modules" || name === "dist" || name === ".turbo",
  });
}

export async function runSectionPlaceholderLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const workspaceRoot = context.workspaceRoot;
  const sectionsDir = join(workspaceRoot, "packages", "ui", "src", "sections");

  try {
    statSync(sectionsDir);
  } catch {
    return {
      exitCode: 0,
      data: { diagnostics: [`No sections directory at ${sectionsDir} — skipping.`] },
    };
  }

  const files = await collectSectionAstroFiles(sectionsDir);

  const violations: PlaceholderViolation[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    if (STUB_PATTERN.test(src)) {
      const rel = relative(workspaceRoot, file).replace(/\\/g, "/");
      // section name = file's parent directory name
      const parts = rel.split("/");
      const section = parts[parts.length - 2] ?? "(unknown)";
      violations.push({ file: rel, section });
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        violations: violations.map(
          (v) =>
            `[ERROR] ${v.file} — section "${v.section}" still renders the JSON.stringify(pageOverride) scaffold stub. ` +
            `Replace it with content-aware markup that renders the section's actual props ` +
            `(heading, body, items, cta, …). The site-kernel-codegen section.scaffold ` +
            `template (RFC-0093) emits a starter with this shape — use it as the baseline ` +
            `and customize for the archetype's layoutHint.`,
        ),
        total: violations.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [
        `All ${files.length} section component(s) render real content (no JSON.stringify stubs).`,
      ],
    },
  };
}
