/*
<MODULE_CONTRACT>
<purpose>
Static lint (CF-IMPORT-01) forbidding static import from "cloudflare:workers"
in packages source files (.ts and .astro). The cloudflare:workers module is only
available in the Cloudflare Workers runtime — a static import causes
ERR_UNSUPPORTED_ESM_URL_SCHEME during Astro SSR build (Node.js cannot resolve the
cloudflare: protocol). The only safe pattern is a dynamic import("cloudflare:workers")
inside a try/catch, which returns undefined at build time.
</purpose>
<non-goals>
  <item>Do not flag dynamic import("cloudflare:workers") — that is the sanctioned pattern.</item>
  <item>Do not flag type-only imports (import type from "cloudflare:workers") — type-only imports are erased at compile time and do not trigger the runtime error.</item>
  <item>Do not scan test files — tests mock the module via vi.mock and are not part of the build.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — prevents recurrence of ERR_UNSUPPORTED_ESM_URL_SCHEME during Astro build.</item>
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
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const SCAN_ROOTS = [
  join("packages", "werkstatt-site", "src"),
  join("packages", "werkstatt-shared", "src"),
];

const FORBIDDEN_MODULE = "cloudflare:workers";

/**
 * Matches static import statements that reference "cloudflare:workers":
 * - `import { env } from "cloudflare:workers"`
 * - `import { env, something } from "cloudflare:workers"`
 * - `import cloudflareWorkers from "cloudflare:workers"`
 *
 * Does NOT match:
 * - `import type { env } from "cloudflare:workers"` (type-only, erased at compile time)
 * - `await import("cloudflare:workers")` (dynamic, sanctioned pattern)
 */
const STATIC_IMPORT_RE = /import\s+(?!type\s)(?:[^"']+\s+from\s+)?["']cloudflare:workers["']/;

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const files = await collectFiles(rootDir, {
    extensions: [".ts", ".astro"],
    ignore: (name) => name === "tests" || name === "node_modules" || name === "dist",
  });
  return files.filter((full) => !full.endsWith(".test.ts") && !full.endsWith(".test.astro"));
}

export function findForbiddenCloudflareWorkersImport(source: string): boolean {
  return STATIC_IMPORT_RE.test(source);
}

async function findOffenders(
  workspaceRoot: string,
): Promise<Array<{ file: string; line: number }>> {
  const offenders: Array<{ file: string; line: number }> = [];

  for (const scanRoot of SCAN_ROOTS) {
    const absRoot = join(workspaceRoot, scanRoot);
    let files: string[];
    try {
      files = await collectSourceFiles(absRoot);
    } catch {
      continue;
    }

    for (const filePath of files) {
      let source: string;
      try {
        source = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      if (!findForbiddenCloudflareWorkersImport(source)) continue;

      const lines = source.split("\n");
      const lineNum = lines.findIndex((line) => STATIC_IMPORT_RE.test(line));
      const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");

      offenders.push({
        file: relFile,
        line: lineNum >= 0 ? lineNum + 1 : 1,
      });
    }
  }

  return offenders;
}

export async function runCloudflareWorkersImportLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const offenders = await findOffenders(workspaceRoot);

  const diagnostics: Diagnostic[] = offenders.map(({ file, line }) => ({
    ruleId: "CF-IMPORT-01",
    severity: "error",
    file,
    message: `Static import from "${FORBIDDEN_MODULE}" — this module is only available in the Cloudflare Workers runtime and causes ERR_UNSUPPORTED_ESM_URL_SCHEME during Astro build. Use a dynamic import("cloudflare:workers") inside a try/catch instead.`,
    fixHint:
      'Replace `import { env } from "cloudflare:workers"` with `const { env } = await import("cloudflare:workers")` inside a try/catch. See access-protection.ts for the canonical pattern.',
    data: { line },
  }));

  return diagnosticsResult("cloudflare.workers.import.lint", diagnostics);
}
