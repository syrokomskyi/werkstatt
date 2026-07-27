/*
<MODULE_CONTRACT>
<purpose>Validates that apps use @gogol/share utilities instead of re-implementing them locally.</purpose>
<non-goals>
  <item>Do not check for app-specific business logic duplication.</item>
  <item>Do not enforce file size limits on app utilities (removed per RFC-0037).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for RFC-0037 Wave 2.</item>
  <item>Allows astro:content imports in @gogol/share per RFC-0037.</item>
</CHANGE_SUMMARY>
*/

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

export interface ShareUtilityLintResult {
  command: "share.utility.lint";
  status: "pass" | "fail";
  violations: ShareUtilityViolation[];
}

export interface ShareUtilityViolation {
  site?: string;
  package?: string;
  file: string;
  rule: "duplicate-export" | "wrong-import-source" | "astro-content-in-app";
  exportName?: string;
  canonicalImport?: string;
  message: string;
}

// Canonical exports from @gogol/share (derived from packages/share/src/index.ts)
// These function names should not be re-implemented in apps
const CANONICAL_EXPORTS = new Set([
  // Content utilities
  "toDataEntryId",
  "getEntryLanguage",
  "stripEntryLanguage",
  "createDispatcherResolver",
  "deepMerge",
  "deepMergeEntryData",
  "mergeComponentContent",
  // i18n utilities
  "createLocalizationHelpers",
  // Schemas
  "componentOverridesSchema",
  // Page pipeline (RFC-0026, RFC-0037)
  "buildPage",
  "resolveComponentPath",
  "resolveComponentPathUnified",
  "PLANET_IMPORT_PATHS",
  "MOON_IMPORT_PATHS",
  // RuntimeContext (RFC-0026)
  "EMPTY_RUNTIME_CONTEXT",
  // Visibility (RFC-0026)
  "VisibilityExprSchema",
  "evalVisibility",
  "EMPTY_FEATURE_GRAPH",
]);

/**
 * Runs share.utility.lint validation.
 * Checks that apps don't re-implement utilities from @gogol/share.
 * Per RFC-0037: allows astro:content imports in @gogol/share.
 */
export async function runShareUtilityLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ShareUtilityLintResult>> {
  const violations: ShareUtilityViolation[] = [];
  const workspaceRoot = context.workspaceRoot;
  const app = input.args[0] as string | undefined;

  // Scan apps if --site not specified, or specific app
  const appsToCheck = app ? [app] : await discoverApps(workspaceRoot);

  for (const app of appsToCheck) {
    const appPath = path.join(workspaceRoot, "apps", app);
    const appViolations = await lintApp(appPath, app);
    violations.push(...appViolations);
  }

  // Also verify @gogol/share itself doesn't have issues
  const shareViolations = await lintSharePackage(workspaceRoot);
  violations.push(...shareViolations);

  return {
    data: {
      command: "share.utility.lint",
      status: violations.length === 0 ? "pass" : "fail",
      violations,
    },
    summary:
      violations.length === 0
        ? "All apps use @gogol/share utilities correctly"
        : `${violations.length} violation(s) found`,
  };
}

async function discoverApps(workspaceRoot: string): Promise<string[]> {
  const appsDir = path.join(workspaceRoot, "apps");
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function lintApp(appPath: string, siteName: string): Promise<ShareUtilityViolation[]> {
  const violations: ShareUtilityViolation[] = [];
  const utilsDir = path.join(appPath, "src", "utils");

  try {
    const files = await fs.readdir(utilsDir);
    const tsFiles = files.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

    for (const file of tsFiles) {
      const filePath = path.join(utilsDir, file);
      const content = await fs.readFile(filePath, "utf-8");

      // Check for re-implementation of canonical exports
      for (const exportName of CANONICAL_EXPORTS) {
        // Simple heuristic: function declaration with same name as canonical export
        const functionPattern = new RegExp(
          `^(export\\s+)?(async\\s+)?function\\s+${exportName}\\s*\\(`,
          "m",
        );
        const constPattern = new RegExp(`^export\\s+const\\s+${exportName}\\s*=`, "m");

        if (functionPattern.test(content) || constPattern.test(content)) {
          violations.push({
            site: siteName,
            file: `src/utils/${file}`,
            rule: "duplicate-export",
            exportName,
            canonicalImport: `@gogol/share`,
            message: `${exportName} is already exported by @gogol/share. Remove local re-implementation and import from the canonical package.`,
          });
        }
      }

      // Check for direct astro:content imports in app
      // RFC-0037: astro:content is allowed in @gogol/share
      // Apps MAY use astro:content for content-collections utilities (legitimate app-specific logic)
      // but should prefer @gogol/share/astro where equivalent functionality exists
      if (
        content.includes('from "astro:content"') &&
        !file.includes("content-collections") &&
        !file.includes("content.config")
      ) {
        violations.push({
          site: siteName,
          file: `src/utils/${file}`,
          rule: "astro-content-in-app",
          message:
            "Direct astro:content import in app. Use @gogol/share/astro or move to content-collections.ts.",
        });
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return violations;
}

async function lintSharePackage(workspaceRoot: string): Promise<ShareUtilityViolation[]> {
  const violations: ShareUtilityViolation[] = [];
  const sharePath = path.join(workspaceRoot, "packages", "share", "src");

  try {
    // Check that astro:content imports exist where expected (RFC-0037)
    const astroContentPath = path.join(sharePath, "astro", "content.ts");
    try {
      const content = await fs.readFile(astroContentPath, "utf-8");
      if (!content.includes("astro:content")) {
        violations.push({
          package: "@gogol/share",
          file: "src/astro/content.ts",
          rule: "wrong-import-source",
          message: "Expected astro:content imports in @gogol/share/astro/content.ts (RFC-0037).",
        });
      }
    } catch {
      // File doesn't exist, which is fine — not all packages use astro content
    }
  } catch {
    // packages/share doesn't exist
  }

  return violations;
}
