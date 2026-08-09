/*
<MODULE_CONTRACT>
<purpose>
dedup.helper.lint — RFC-0303: fails when a reserved shared-helper identifier
(fileExists, collectFiles, collectMarkdownFiles, getLineColumn,
discoverWorkspacePackages, readJsonFile, readYamlFile) is re-declared locally instead of
imported from its canonical home. Structurally prevents the next agent from
re-introducing the duplication class this RFC cleaned up.
</purpose>
<non-goals>
  <item>Do not flag mere re-exports (`export { fileExists } from "@warpgogol/werkstatt-site/share/fs"`) — only fresh declarations.</item>
  <item>Do not flag a differently-named local wrapper that internally delegates to the canonical helper.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: initial implementation, Phase 2.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const SCAN_ROOT = join("packages");

/**
 * Files that deliberately inline reserved helpers for dependency-free
 * portability (e.g. @warpgogol/forge cannot depend on @warpgogol/werkstatt-site/share).
 * Each entry is a repo-relative file path.
 */
const INLINE_ALLOWLIST = new Set<string>(["packages/forge/src/utils/fs.ts"]);

/** Reserved shared-helper identifiers and the single file allowed to declare each. */
export const RESERVED_HELPERS: Record<string, { importPath: string; canonicalFile: string }> = {
  fileExists: {
    importPath: "@warpgogol/werkstatt-site/share/fs",
    canonicalFile: "packages/share/src/fs/index.ts",
  },
  collectFiles: {
    importPath: "@warpgogol/werkstatt-site/share/fs",
    canonicalFile: "packages/share/src/fs/index.ts",
  },
  readJsonFile: {
    importPath: "@warpgogol/werkstatt-site/share/fs",
    canonicalFile: "packages/share/src/fs/index.ts",
  },
  readYamlFile: {
    importPath: "@warpgogol/werkstatt-site/share/fs",
    canonicalFile: "packages/share/src/fs/index.ts",
  },
  getLineColumn: {
    importPath: "@warpgogol/werkstatt-site/share/text-position",
    canonicalFile: "packages/share/src/text-position.ts",
  },
  collectMarkdownFiles: {
    importPath: "@warpgogol/werkstatt-site/content",
    canonicalFile: "packages/os/site-kernel-content/src/content-files.ts",
  },
  discoverWorkspacePackages: {
    importPath: "@warpgogol/site-kernel",
    canonicalFile: "packages/os/site-kernel/src/workspace-discovery.ts",
  },
};

function declarationRegex(identifier: string): RegExp {
  return new RegExp(
    `^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${identifier}\\s*\\(|^\\s*(?:export\\s+)?const\\s+${identifier}\\s*=\\s*async\\s*\\(`,
    "m",
  );
}

/** Pure scan: which reserved identifiers does this source locally declare (not just import/re-export)? */
export function findLocalReservedDeclarations(source: string): string[] {
  const found: string[] = [];
  for (const identifier of Object.keys(RESERVED_HELPERS)) {
    if (declarationRegex(identifier).test(source)) found.push(identifier);
  }
  return found;
}

export async function runDedupHelperLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const files = await collectFiles(join(workspaceRoot, SCAN_ROOT), {
    extensions: [".ts", ".tsx"],
    ignore: (name) => name === "tests" || name.endsWith(".generated.yaml"),
  });

  const diagnostics: Diagnostic[] = [];
  for (const filePath of files) {
    const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");

    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    for (const identifier of findLocalReservedDeclarations(source)) {
      const { importPath, canonicalFile } = RESERVED_HELPERS[identifier]!;
      if (relFile === canonicalFile) continue;
      if (INLINE_ALLOWLIST.has(relFile)) continue;

      diagnostics.push({
        ruleId: "DEDUP-01",
        severity: "error",
        file: relFile,
        message: `Local re-declaration of reserved shared helper '${identifier}'.`,
        fixHint: `Import { ${identifier} } from "${importPath}" instead of re-declaring it.`,
        data: { identifier, canonicalFile },
      });
    }
  }

  return diagnosticsResult("dedup.helper.lint", diagnostics);
}
