/*
<MODULE_CONTRACT>
<purpose>Canonical implementation of Compass scan-root resolution for all kernel Compass commands.</purpose>
<non-goals>
  <item>Do not implement Compass scanning or file processing logic here.</item>
  <item>Do not register commands or modify runtime context.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Introduced as part of RFC-0015 to extend Compass commands to packages/.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { KernelCommandInput } from "./types.ts";
import type { KernelRuntimeContext } from "./types.ts";

/**
 * Resolves the scan root directory for Compass commands.
 *
 * Flag semantics (RFC-0015):
 *   --site <name>                  Scan apps/<name>/ only (existing behavior, unchanged)
 *   --packages                    Scan packages/ only
 *   --packages --package <name>   Scan the src/ of the named package (auto-discovered)
 *   (no flag)                     Workspace-wide default: apps/, packages/, and services/
 *
 * --site and --packages are mutually exclusive. Passing both throws an error.
 *
 * Note: --site is consumed by the CLI layer and sets context.siteExplicit = true. Checking
 * context.site alone is insufficient because it may be populated by cwd inference.
 */
export function resolveCompassScanRoot(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): string | undefined {
  const hasPackages = input.flags["packages"] === true;

  if (context.siteExplicit && hasPackages) {
    throw new Error(
      "[compass] --site and --packages are mutually exclusive. Use one or the other.",
    );
  }

  if (!hasPackages) {
    // Existing behavior: app-scoped or workspace-wide default.
    return context.site ? context.site.directory : undefined;
  }

  const packageName = input.flags["package"];
  if (!packageName || typeof packageName !== "string") {
    // --packages without --package <name>: scan all of packages/
    return resolve(context.workspaceRoot, "packages");
  }

  // --packages --package <name>: locate the package directory by name.
  // Try common monorepo layouts: packages/os/<name> then packages/<name>.
  const candidates = [
    resolve(context.workspaceRoot, "packages", "os", packageName),
    resolve(context.workspaceRoot, "packages", packageName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const srcPath = resolve(candidate, "src");
      return existsSync(srcPath) ? srcPath : candidate;
    }
  }

  throw new Error(
    `[compass] Package "${packageName}" not found. Tried:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
  );
}
