/*
<MODULE_CONTRACT>
<purpose>
Implements astro.exports.lint — the OS command that enforces the dual-key
subpath export contract for .astro files (RFC-0089).
</purpose>
<non-goals>
  <item>Do not modify package.json files — this is a read-only lint.</item>
  <item>Do not validate non-.astro exports (those keep the extensionless convention).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0089: Initial implementation of the astro.exports.lint command.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

interface AstroExportViolation {
  packagePath: string;
  key: string;
  target: string;
  message: string;
}

export async function runAstroExportsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: AstroExportViolation[] = [];
  const workspaceRoot = context.workspaceRoot;
  const packagesDir = join(workspaceRoot, "packages");

  // Collect all package.json files under packages/
  let pkgDirs: string[] = [];
  try {
    const topEntries = readdirSync(packagesDir);
    for (const entry of topEntries) {
      const full = join(packagesDir, entry);
      if (statSync(full).isDirectory()) {
        // Explore os/ subdirectory too
        const pkgJson = join(full, "package.json");
        if (existsSync(pkgJson)) {
          pkgDirs.push(full);
        }
        // Check for nested packages like os/site-kernel-checks
        try {
          const subEntries = readdirSync(full);
          for (const sub of subEntries) {
            const subFull = join(full, sub);
            if (statSync(subFull).isDirectory()) {
              const subPkgJson = join(subFull, "package.json");
              if (existsSync(subPkgJson)) {
                pkgDirs.push(subFull);
              }
            }
          }
        } catch {
          // not a directory or inaccessible
        }
      }
    }
  } catch {
    return {
      exitCode: 1,
      data: { diagnostics: [`Cannot read packages directory: ${packagesDir}`] },
    };
  }

  for (const dir of pkgDirs) {
    const pkgJsonPath = join(dir, "package.json");
    let pkg: Record<string, unknown>;
    try {
      const raw = readFileSync(pkgJsonPath, "utf-8");
      pkg = JSON.parse(raw);
    } catch {
      continue;
    }

    const exports = pkg.exports as Record<string, { types?: string; default?: string }> | undefined;
    if (!exports) continue;

    // Find all keys that target .astro files
    const astroKeys: Record<string, string> = {};
    const astroKeyWithSuffix: Record<string, string> = {};

    for (const [key, value] of Object.entries(exports)) {
      if (!value || typeof value !== "object") continue;
      const target = value.types ?? value.default;
      if (!target || typeof target !== "string") continue;
      if (!target.endsWith(".astro")) continue;

      if (key.endsWith(".astro")) {
        astroKeyWithSuffix[key] = target;
      } else {
        astroKeys[key] = target;
      }
    }

    // Check every extensionless key has a valid .astro sibling
    for (const [key, target] of Object.entries(astroKeys)) {
      const suffixedKey = `${key}.astro`;
      const sibling = astroKeyWithSuffix[suffixedKey];
      if (!sibling) {
        violations.push({
          packagePath: pkgJsonPath,
          key,
          target,
          message:
            `exports map declares "${key}" → ${target} ` +
            `but no "${suffixedKey}" key. Add a sibling exports entry pointing to the same ` +
            `file so Vite's static-build resolver can resolve the .astro-suffixed import used ` +
            `by scaffold templates (RFC-0089).`,
        });
      } else if (sibling !== target) {
        violations.push({
          packagePath: pkgJsonPath,
          key,
          target,
          message:
            `exports map has "${key}" → ${target} and "${suffixedKey}" → ${sibling} ` +
            `but they point to different files. Both must alias the same source file (RFC-0089).`,
        });
      }
    }

    // Check every .astro suffixed key has an extensionless sibling (reverse direction)
    for (const [key, target] of Object.entries(astroKeyWithSuffix)) {
      const extensionlessKey = key.replace(/\.astro$/, "");
      if (!astroKeys[extensionlessKey]) {
        violations.push({
          packagePath: pkgJsonPath,
          key,
          target,
          message:
            `exports map has "${key}" → ${target} ` +
            `but no "${extensionlessKey}" key. Both the extensionless and .astro-suffixed ` +
            `forms must be declared as aliases of the same source file (RFC-0089).`,
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        diagnostics: violations.map(
          (v) => `[ERROR] ${v.packagePath.replace(workspaceRoot, "")} — ${v.message}`,
        ),
      },
    };
  }

  return { exitCode: 0, data: { diagnostics: ["All Astro exports have valid dual-key entries."] } };
}

function existsSync(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
