/*
<MODULE_CONTRACT>
<purpose>Implements the navigation.section.validate command per RFC-0019. Detects pages in the content-declared feature graph that use a breadcrumb/navigation component but lack a section with role "navigation".</purpose>
<non-goals>
  <item>Do not modify source files.</item>
  <item>Do not validate apps that have not adopted the content-declared feature graph (apps/main).</item>
  <item>Do not enforce shared-component declarations (header/footer) into the page-body hierarchy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implement RFC-0019 Phase 4: navigation.section.validate command.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type { HierarchyViolation, HierarchyValidationResult } from "./structure-hierarchy.ts";

const NAVIGATION_COMPONENT_PATHS = [
  "breadcrumbs",
  "section/navigation-section",
  "navigation-section",
];

function isNavigationComponentPath(componentPath: string): boolean {
  return NAVIGATION_COMPONENT_PATHS.some(
    (p) => componentPath === p || componentPath.endsWith(`/${p}`),
  );
}

interface NavSectionView {
  role?: string;
  components?: Array<{ componentPath?: string }>;
}
interface NavPageFrontmatter {
  kind?: string;
  page?: { sections?: NavSectionView[] };
}

function pageHasNavigationSection(sections: NavSectionView[]): boolean {
  return sections.some((s) => s.role === "navigation");
}

function pageHasNavigationComponent(sections: NavSectionView[]): boolean {
  for (const section of sections) {
    if (!Array.isArray(section.components)) continue;
    for (const component of section.components) {
      if (
        typeof component.componentPath === "string" &&
        isNavigationComponentPath(component.componentPath)
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function runNavigationSectionValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<HierarchyValidationResult>> {
  const paths = requireAstroSitePaths(context);
  const featuresPageDir = join(paths.contentDirectory, "features", "pages");
  const violations: HierarchyViolation[] = [];

  // Skip apps that have not adopted the content-declared feature graph
  try {
    await readdir(featuresPageDir);
  } catch {
    return {
      data: {
        command: "navigation.section.validate",
        status: "pass",
        checkedPages: 0,
        checkedSections: 0,
        violations: [],
      },
      exitCode: 0,
      summary:
        "[navigation.section.validate] SKIP (no src/content/features/pages found — app has not adopted content-declared feature graph)",
    };
  }

  const featureFiles = await collectMarkdownFiles(featuresPageDir);
  let checkedSections = 0;

  for (const filePath of featureFiles) {
    const source = await readFile(filePath, "utf8");
    const { data } = parseMarkdownFrontmatter(source);
    const relFile = relative(paths.appDirectory, filePath);

    if (!data || typeof data !== "object") continue;
    const featureData = data as NavPageFrontmatter;
    if (featureData.kind !== "page" || !Array.isArray(featureData.page?.sections)) continue;

    const sections: NavSectionView[] = featureData.page.sections;
    checkedSections += sections.length;

    if (pageHasNavigationComponent(sections) && !pageHasNavigationSection(sections)) {
      violations.push({
        file: relFile,
        rule: "missing-navigation-section",
        message: `Page declares breadcrumb/navigation component but has no section with role "navigation". Add a section with role: navigation before the content section.`,
      });
    }
  }

  const jsonFlag = input.flags?.["json"] === true;

  if (jsonFlag) {
    const result: HierarchyValidationResult = {
      command: "navigation.section.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedPages: featureFiles.length,
      checkedSections,
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
      command: "navigation.section.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedPages: featureFiles.length,
      checkedSections,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[navigation.section.validate] OK (${featureFiles.length} pages, ${checkedSections} sections checked)`
        : undefined,
  };
}
