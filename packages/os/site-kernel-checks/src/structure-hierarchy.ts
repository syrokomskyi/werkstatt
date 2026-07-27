/*
<MODULE_CONTRACT>
<purpose>Implements the structure.hierarchy.validate command per RFC-0019. Detects page routes that render breadcrumb components directly instead of delegating to a navigation section component.</purpose>
<non-goals>
  <item>Do not modify source files.</item>
  <item>Do not validate component internals or section HTML structure.</item>
  <item>Do not enforce hierarchy on shared shell components (layout, header, footer).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implement RFC-0019 Phase 4: structure.hierarchy.validate command.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

export interface HierarchyViolation {
  file: string;
  rule:
    | "route-renders-component-outside-section"
    | "missing-feature-section"
    | "missing-section-component"
    | "missing-navigation-section"
    | "breadcrumbs-outside-navigation-section"
    | "section-order-violation"
    | "undeclared-component-content-source";
  message: string;
}

export interface HierarchyValidationResult {
  command: "structure.hierarchy.validate" | "navigation.section.validate";
  status: "pass" | "fail";
  checkedPages: number;
  checkedSections: number;
  violations: HierarchyViolation[];
}

async function collectAstroFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectAstroFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".astro")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Returns true if the route source imports Breadcrumbs directly (not via NavigationSection).
 * Detection strategy: import line references breadcrumbs.astro and the file does NOT
 * replace it entirely with a navigation-section import.
 */
function routeImportsBreadcrumbsDirectly(source: string): boolean {
  // Match import lines that reference breadcrumbs.astro (case-insensitive path)
  const breadcrumbsImportRe = /import\s+\w+\s+from\s+["'][^"']*breadcrumbs\.astro["']/i;
  return breadcrumbsImportRe.test(source);
}

export async function runStructureHierarchyValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<HierarchyValidationResult>> {
  const paths = requireAstroSitePaths(context);
  const pagesLangDir = join(paths.srcDirectory, "pages", "[lang]");
  const violations: HierarchyViolation[] = [];

  const routeFiles = await collectAstroFiles(pagesLangDir);

  for (const filePath of routeFiles) {
    const source = await readFile(filePath, "utf8");
    const relFile = relative(paths.appDirectory, filePath);

    if (routeImportsBreadcrumbsDirectly(source)) {
      violations.push({
        file: relFile,
        rule: "route-renders-component-outside-section",
        message:
          "Route imports Breadcrumbs directly. Render breadcrumb UI through section/navigation-section.astro instead.",
      });
    }
  }

  const jsonFlag = input.flags?.["json"] === true;

  if (jsonFlag) {
    const result: HierarchyValidationResult = {
      command: "structure.hierarchy.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedPages: routeFiles.length,
      checkedSections: 0,
      violations,
    };
    context.logger.info(JSON.stringify(result, null, 2));
  } else {
    for (const v of violations) {
      context.logger.error(`${v.file}: ${v.message} [${v.rule}]`);
    }
  }

  return {
    data: {
      command: "structure.hierarchy.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedPages: routeFiles.length,
      checkedSections: 0,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[structure.hierarchy.validate] OK (${routeFiles.length} routes checked)`
        : undefined,
  };
}
