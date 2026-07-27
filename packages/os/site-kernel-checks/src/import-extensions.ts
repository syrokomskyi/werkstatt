/*
<MODULE_CONTRACT>
<purpose>
Implements import.extensions.lint — enforces that relative imports under
packages/ use the on-disk `.ts` / `.tsx` extension. Forbids `.js` / `.jsx`
and extensionless relative imports. One rule for all packages: authors write
`.ts`, and tsconfig/node-lib.json's rewriteRelativeImportExtensions produces
`.js` for emit-enabled consumers automatically.

This is the workspace-wide invariant that prevents the recurring
"Cannot find module '…/foo.js' imported from '…/foo.ts'" astro-dev failure
and the "An import path can only end with a '.ts' extension when
'allowImportingTsExtensions' is enabled" build failure (RFC-0092).
</purpose>
<non-goals>
  <item>Do not rewrite imports — this is a read-only lint. The diagnostic
        emits the exact `sed` command for the agent to run.</item>
  <item>Do not enforce extensions in apps/ — Astro/Vite handles those.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0092: Initial implementation.</item>
  <item>Extend scanning to import("...") specifiers so type-query imports cannot bypass RFC-0092.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { collectFiles } from "@gogol/share/fs";

interface ImportViolation {
  file: string;
  line: number;
  specifier: string;
  reason: "js-extension" | "jsx-extension" | "extensionless";
}

// Match: (from|import|export-from) "<relative-specifier>"
// Captures specifier in group 1. Skips type-only constructs identically.
// Anchor to start-of-line (with optional indentation) so string literals containing
// "import '…'" inside logger messages or template strings don't false-positive.
const IMPORT_RE =
  /^[ \t]*(?:import\s+(?:type\s+)?[^"';]*from|export\s+(?:type\s+)?(?:\*\s+as\s+\w+|\*|\{[^}]*\})\s+from|import)\s*["']((?:\.|\.\.)\/[^"']+)["']/gm;

// Match TypeScript import-query types and dynamic imports:
//   import("./foo.ts").Foo
//   await import("../foo.ts")
const IMPORT_CALL_RE = /\bimport\s*\(\s*["']((?:\.|\.\.)\/[^"']+)["']\s*\)/gm;

const ALLOWED_NON_TS_EXTS = new Set([
  ".astro",
  ".css",
  ".scss",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".mdx",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".html",
  ".txt",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

function classify(specifier: string): ImportViolation["reason"] | null {
  if (specifier.endsWith(".js")) return "js-extension";
  if (specifier.endsWith(".jsx")) return "jsx-extension";
  // Detect extensionless: last path segment has no dot OR has a dot but not in allow-list
  const last = specifier.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return "extensionless";
  const ext = last.slice(dot).toLowerCase();
  if (ALLOWED_NON_TS_EXTS.has(ext)) return null;
  // Unknown extension: treat as extensionless (last "dot" is part of a name like ".module")
  return "extensionless";
}

async function collectLintableTsFiles(dir: string): Promise<string[]> {
  const files = await collectFiles(dir, {
    extensions: [".ts", ".tsx"],
    ignore: (name) => name === "node_modules" || name === "dist" || name === ".turbo",
  });
  return files.filter(
    (p) => !p.endsWith(".d.ts") && !p.endsWith(".template.ts") && !p.endsWith(".template.tsx"),
  );
}

export async function runImportExtensionsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const workspaceRoot = context.workspaceRoot;
  const packagesDir = join(workspaceRoot, "packages");

  const files = await collectLintableTsFiles(packagesDir);

  const violations: ImportViolation[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      const specifier = m[1]!;
      const reason = classify(specifier);
      if (reason === null) continue;
      // Compute 1-indexed line
      const upto = src.slice(0, m.index + m[0].indexOf(specifier));
      const line = (upto.match(/\n/g)?.length ?? 0) + 1;
      violations.push({ file, line, specifier, reason });
    }
    IMPORT_CALL_RE.lastIndex = 0;
    while ((m = IMPORT_CALL_RE.exec(src)) !== null) {
      const specifier = m[1]!;
      const reason = classify(specifier);
      if (reason === null) continue;
      const upto = src.slice(0, m.index + m[0].indexOf(specifier));
      const line = (upto.match(/\n/g)?.length ?? 0) + 1;
      violations.push({ file, line, specifier, reason });
    }
  }

  if (violations.length > 0) {
    const diagnostics = violations.slice(0, 50).map((v) => {
      const rel = relative(workspaceRoot, v.file).replace(/\\/g, "/");
      if (v.reason === "js-extension" || v.reason === "jsx-extension") {
        const fixed = v.specifier.replace(/\.jsx?$/, v.reason === "jsx-extension" ? ".tsx" : ".ts");
        return (
          `[ERROR] ${rel}:${v.line} — relative import "${v.specifier}" uses ` +
          `.${v.reason === "js-extension" ? "js" : "jsx"} extension. ` +
          `Rewrite to "${fixed}" (RFC-0092: source-consumed packages use the on-disk .ts/.tsx ` +
          `extension; tsconfig/node-lib.json carries rewriteRelativeImportExtensions so emit-enabled ` +
          `consumers still produce .js output).`
        );
      }
      return (
        `[ERROR] ${rel}:${v.line} — relative import "${v.specifier}" is extensionless. ` +
        `Add the .ts (or .tsx) extension (RFC-0092).`
      );
    });
    if (violations.length > 50) {
      diagnostics.push(`… and ${violations.length - 50} more violation(s).`);
    }
    return {
      exitCode: 1,
      data: { violations: diagnostics, total: violations.length },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [`All ${files.length} source file(s) under packages/ use .ts/.tsx extensions.`],
    },
  };
}
