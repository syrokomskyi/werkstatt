/*
<MODULE_CONTRACT>
<purpose>
Implements tsconfig.shape.lint — workspace-wide invariants on the SHARED
TypeScript base configs under tsconfig/. RFC-0092 requires the shared base
to enable allowImportingTsExtensions (so every source-consumed package can
relative-import .ts directly) and the emit-enabled chain to enable
rewriteRelativeImportExtensions (so consumers that ship .js — like
site-kernel-content — produce correct output).
</purpose>
<non-goals>
  <item>Do not require a specific extends target — packages/ui extends astro presets.</item>
  <item>Do not rewrite files — lint only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0092: Initial implementation.</item>
  <item>RFC-0092 revision: enforce shared-base flags (allowImportingTsExtensions on base,
        rewriteRelativeImportExtensions on node-lib) rather than rejecting them per-package.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";

interface TsconfigViolation {
  file: string;
  message: string;
}

async function collectTsconfigFiles(dir: string): Promise<string[]> {
  const files = await collectFiles(dir, {
    ignore: (name) => name === "node_modules" || name === "dist" || name === ".turbo",
  });
  return files.filter((p) => /^tsconfig(\..+)?\.json$/.test(basename(p)));
}

function stripJsonComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripJsonComments(readFileSync(file, "utf-8")));
  } catch {
    return null;
  }
}

export async function runTsconfigShapeLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const workspaceRoot = context.workspaceRoot;
  const violations: TsconfigViolation[] = [];

  // Invariant 1: tsconfig/base.json must enable allowImportingTsExtensions
  const basePath = join(workspaceRoot, "tsconfig", "base.json");
  if (existsSync(basePath)) {
    const base = readJson(basePath);
    const baseCo = (base?.compilerOptions ?? {}) as Record<string, unknown>;
    if (baseCo.allowImportingTsExtensions !== true) {
      violations.push({
        file: basePath,
        message:
          `compilerOptions.allowImportingTsExtensions must be true so source-consumed ` +
          `packages can import "./foo.ts" directly. Removing this flag re-breaks Astro dev ` +
          `for every app (RFC-0092).`,
      });
    }
  } else {
    violations.push({
      file: basePath,
      message: `expected shared base config at tsconfig/base.json`,
    });
  }

  // Invariant 2: tsconfig/node-lib.json must enable rewriteRelativeImportExtensions
  const nodeLibPath = join(workspaceRoot, "tsconfig", "node-lib.json");
  if (existsSync(nodeLibPath)) {
    const nl = readJson(nodeLibPath);
    const nlCo = (nl?.compilerOptions ?? {}) as Record<string, unknown>;
    if (nlCo.rewriteRelativeImportExtensions !== true) {
      violations.push({
        file: nodeLibPath,
        message:
          `compilerOptions.rewriteRelativeImportExtensions must be true so emit-enabled ` +
          `consumers (e.g. @warpgogol/site-kernel-content) rewrite .ts source imports to .js ` +
          `in their dist/ output (RFC-0092).`,
      });
    }
  } else {
    violations.push({
      file: nodeLibPath,
      message: `expected shared emit config at tsconfig/node-lib.json`,
    });
  }

  // Invariant 3: no package tsconfig may EXPLICITLY set allowImportingTsExtensions: false
  const packagesDir = join(workspaceRoot, "packages");
  const files = await collectTsconfigFiles(packagesDir);
  for (const file of files) {
    const parsed = readJson(file);
    if (!parsed) {
      violations.push({ file, message: `cannot parse tsconfig` });
      continue;
    }
    const co = (parsed.compilerOptions ?? {}) as Record<string, unknown>;
    if (co.allowImportingTsExtensions === false) {
      violations.push({
        file,
        message:
          `compilerOptions.allowImportingTsExtensions is explicitly false — this re-breaks ` +
          `relative .ts imports for this package. Remove the override; the shared base supplies true (RFC-0092).`,
      });
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        violations: violations.map(
          (v) => `[ERROR] ${relative(workspaceRoot, v.file).replace(/\\/g, "/")} — ${v.message}`,
        ),
        total: violations.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [
        `Shared tsconfig invariants OK; scanned ${files.length} package tsconfig file(s).`,
      ],
    },
  };
}
