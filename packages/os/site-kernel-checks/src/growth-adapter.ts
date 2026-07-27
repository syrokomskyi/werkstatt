/*
<MODULE_CONTRACT>
<purpose>
growth.adapter.contract + growth.vendor.resolve — validates GrowthAdapter
implementations and resolves the vendor adapter declared in src/content/system.md.

growth.adapter.contract: checks that every adapter package exports a default
that structurally satisfies the GrowthAdapter interface (id, init, track fields).

growth.vendor.resolve: checks that the adapter id declared in src/content/system.md
growth.vendor.adapter is a known registered adapter id.
</purpose>
<non-goals>
  <item>Do not instantiate or run adapters at validation time.</item>
  <item>Do not check vendor-specific API keys — only structural contract.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0027): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { KNOWN_ADAPTER_IDS } from "@gogol/growth";
import { resultFromViolations } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// Known adapter ids — imported from @gogol/growth (single source of truth)
// ---------------------------------------------------------------------------

const KNOWN_ADAPTER_SET = new Set<string>(KNOWN_ADAPTER_IDS);

// Required method signatures a GrowthAdapter module must export (as method names)
const REQUIRED_ADAPTER_METHODS = ["init", "track"] as const;

// ---------------------------------------------------------------------------
// runGrowthAdapterContract
// ---------------------------------------------------------------------------

/**
 * Structural check: each adapter package under packages/growth-adapter-*
 * must export a default object with id (string), init (function), track (function).
 */
export async function runGrowthAdapterContract(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  const repoRoot = context.workspaceRoot;
  const packagesDir = join(repoRoot, "packages");

  try {
    const { readdir } = await import("node:fs/promises");
    const packageEntries = await readdir(packagesDir, { withFileTypes: true });

    const adapterPackages = packageEntries.filter(
      (e) => e.isDirectory() && e.name.startsWith("growth-adapter-"),
    );

    for (const pkg of adapterPackages) {
      const pkgName = pkg.name;
      const pkgDir = join(packagesDir, pkgName);
      const rel = `packages/${pkgName}`;

      // Skip directories without a package.json — they are leftover artifacts,
      // not real adapter packages (e.g. growth-adapter-null was inlined into
      // @gogol/growth, growth-adapter-plausible was never created).
      const pkgJsonPath = join(pkgDir, "package.json");
      let pkgJson: Record<string, unknown>;
      try {
        const raw = await readFile(pkgJsonPath, "utf8");
        pkgJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Must have @gogol/growth as dependency
      const deps = {
        ...(pkgJson["dependencies"] as Record<string, string> | undefined),
        ...(pkgJson["peerDependencies"] as Record<string, string> | undefined),
      };
      if (!deps["@gogol/growth"]) {
        violations.push(
          `GAC-02: ${rel}/package.json: adapter must declare "@gogol/growth" as a dependency or peerDependency`,
        );
      }

      // Check src/index.ts exists
      const indexPath = join(pkgDir, "src", "index.ts");
      let indexContent: string;
      try {
        indexContent = await readFile(indexPath, "utf8");
      } catch {
        violations.push(
          `GAC-03: ${rel}/src/index.ts: missing — adapter must export from src/index.ts`,
        );
        continue;
      }

      // Collect content to check: index.ts plus any re-exported files
      // (e.g. `export { default } from "./adapter.ts"`) so the structural
      // grep can find the contract fields in the implementation file.
      const checkContents: string[] = [indexContent];
      const reExportPattern =
        /export\s+(?:\{[^}]*default[^}]*\}|default)\s+from\s+["']\.\/([^'"]+)["']/g;
      let reExportMatch: RegExpExecArray | null;
      while ((reExportMatch = reExportPattern.exec(indexContent)) !== null) {
        const targetFile = reExportMatch[1].endsWith(".ts")
          ? reExportMatch[1]
          : `${reExportMatch[1]}.ts`;
        try {
          const reExportContent = await readFile(join(pkgDir, "src", targetFile), "utf8");
          checkContents.push(reExportContent);
        } catch {
          // Re-exported file not found — will be caught by other checks
        }
      }
      const combinedContent = checkContents.join("\n");

      // Must have export default (either directly or via re-export)
      if (!combinedContent.includes("export default")) {
        violations.push(
          `GAC-04: ${rel}/src/index.ts: must export a default GrowthAdapter object (export default ...)`,
        );
      }

      // Must reference the required methods (structural grep).
      // Match `methodName(` OR `methodName<...>(` (TypeScript generic) OR
      // `methodName : ` (object-property arrow form). Word-boundary anchored.
      for (const method of REQUIRED_ADAPTER_METHODS) {
        const pattern = new RegExp(`\\b${method}\\s*(?:<[^>]*>)?\\s*[(:]`);
        if (!pattern.test(combinedContent)) {
          violations.push(
            `GAC-05: ${rel}/src/index.ts: GrowthAdapter contract requires method "${method}()" — not found`,
          );
        }
      }

      // Must have an "id" field
      if (!/\bid\s*:\s*["']/.test(combinedContent)) {
        violations.push(
          `GAC-06: ${rel}/src/index.ts: GrowthAdapter contract requires an "id" string field`,
        );
      }
    }
  } catch {
    // packages/ not accessible
    violations.push("GAC-00: Could not read packages/ directory");
  }

  return resultFromViolations("growth.adapter.contract", violations);
}

// ---------------------------------------------------------------------------
// runGrowthVendorResolve
// ---------------------------------------------------------------------------

/**
 * Cross-reference: the adapter id in src/content/system.md growth.vendor.adapter must
 * match a known registered adapter id.
 */
export async function runGrowthVendorResolve(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  const appDir = context.site?.directory ?? process.cwd();

  try {
    const { manifest: system } = await loadSystemManifest(join(appDir, "src", "content"));
    const growth = system["growth"] as Record<string, unknown> | undefined;

    if (!growth) {
      // Growth block absent — not an error. GrowthProvider is simply not used.
      return resultFromViolations("growth.vendor.resolve", []);
    }

    const vendor = growth["vendor"] as Record<string, unknown> | undefined;
    if (!vendor) {
      violations.push(
        "GVR-01: src/content/system.md growth.vendor block is required when growth is declared",
      );
      return resultFromViolations("growth.vendor.resolve", violations);
    }

    const adapterId = vendor["adapter"] as string | undefined;
    if (!adapterId) {
      violations.push("GVR-02: src/content/system.md growth.vendor.adapter is required");
    } else if (!KNOWN_ADAPTER_SET.has(adapterId)) {
      violations.push(
        `GVR-03: src/content/system.md growth.vendor.adapter "${adapterId}" is not a known adapter id. ` +
          `Known adapters: ${[...KNOWN_ADAPTER_SET].join(", ")}. ` +
          `To register a custom adapter, add it to KNOWN_ADAPTER_IDS in packages/growth/src/adapter.ts and the loader map in provider.astro.`,
      );
    }
  } catch {
    // No src/content/system.md — handled by system.manifest.validate
  }

  return resultFromViolations("growth.vendor.resolve", violations);
}
