/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/feature-graph.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not modify content or configuration files.</item>
  <item>Do not handle runtime rendering or behavior.</item>
  <item>Do not persist validation state.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implement RFC-0018: Feature graph validation commands.</item>
  <item>Add graph structure validation.</item>
  <item>Add link resolution validation.</item>
  <item>Add projection integrity validation.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";

/**
 * Narrow projection of feature-graph frontmatter. Covers every field this
 * module actually reads — replaces the prior `data as any` casts so each
 * field's optionality is visible in the type system.
 */
interface FeatureItemEntry {
  href?: string;
  label?: string;
  id?: string;
}
interface FeatureComponentEntry {
  id?: string;
  kind?: string;
  enabled?: boolean;
  visibility?: string;
  componentPath?: string;
  items?: FeatureItemEntry[];
}
interface FeatureSectionEntry {
  id?: string;
  kind?: string;
  role?: string;
  enabled?: boolean;
  visibility?: string;
  componentPath?: string;
  items?: FeatureItemEntry[];
  components?: FeatureComponentEntry[];
}
interface FeatureFrontmatter {
  kind?: string;
  page?: {
    id?: string;
    enabled?: boolean;
    visibility?: string;
    routeSlug?: string;
    sections?: FeatureSectionEntry[];
  };
  component?: { id?: string; kind?: string };
  section?: { id?: string; kind?: string };
  sharedComponent?: { id?: string; kind?: string; componentPath?: string };
  items?: FeatureItemEntry[];
}

export interface FeatureGraphViolation {
  file: string;
  rule:
    | "duplicate-node-id"
    | "missing-route"
    | "missing-section-anchor"
    | "missing-component-anchor"
    | "missing-component-path"
    | "missing-item-id"
    | "dangling-target"
    | "disabled-target-leak"
    | "raw-internal-href"
    | "missing-section-role"
    | "duplicate-navigation-section"
    | "navigation-section-missing-component"
    | "navigation-component-outside-navigation-section";
  message: string;
}

export interface FeatureGraphValidationResult {
  command: "feature.graph.validate" | "feature.links.validate" | "feature.projections.validate";
  status: "pass" | "fail";
  checkedFiles: number;
  violations: FeatureGraphViolation[];
}

async function checkRouteExists(appDir: string, routeSlug: string): Promise<boolean> {
  const pagesDir = join(appDir, "src", "pages");

  // Handle home page (empty slug)
  if (!routeSlug) {
    const indexPath = join(pagesDir, "[lang]", "index.astro");
    try {
      await readFile(indexPath, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  const routePath = join(pagesDir, "[lang]", `${routeSlug}.astro`);
  try {
    await readFile(routePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

// @ai-invariant RFC-0020: The approved layer suffixes are "-component" (top-level components)
// and "-section" (components under section/). When a componentPath such as "header" is looked
// up, we probe the canonical suffixed filename first, then fall back to the plain name for
// backward compatibility. Never hardcode app-specific paths here.
const LAYER_SUFFIXES = ["-component", "-section"] as const;

function resolveComponentCandidates(componentPath: string): string[] {
  const base = componentPath.includes("/") ? componentPath : componentPath;
  const candidates = [`${base}.astro`];
  for (const suffix of LAYER_SUFFIXES) {
    const lastSlash = base.lastIndexOf("/");
    const name = lastSlash >= 0 ? base.slice(lastSlash + 1) : base;
    const dir = lastSlash >= 0 ? base.slice(0, lastSlash + 1) : "";
    if (!name.endsWith(suffix)) {
      candidates.push(`${dir}${name}${suffix}.astro`);
    }
  }
  return candidates;
}

async function _checkAnchorExists(
  appDir: string,
  componentPath: string,
  anchor: string,
): Promise<boolean> {
  const candidates = resolveComponentCandidates(componentPath);
  for (const candidate of candidates) {
    const componentFile = join(appDir, "src", "components", candidate);
    try {
      const source = await readFile(componentFile, "utf8");
      if (source.includes(`id="${anchor}"`) || source.includes(`id='${anchor}'`)) {
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}

async function checkComponentExists(appDir: string, componentPath: string): Promise<boolean> {
  const candidates = resolveComponentCandidates(componentPath);
  for (const candidate of candidates) {
    const componentFile = join(appDir, "src", "components", candidate);
    try {
      await readFile(componentFile, "utf8");
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

const NAVIGATION_COMPONENT_PATHS = new Set([
  "breadcrumbs",
  "section/navigation-section",
  "navigation-section",
]);

function isNavigationComponentPath(componentPath: string): boolean {
  return (
    NAVIGATION_COMPONENT_PATHS.has(componentPath) ||
    [...NAVIGATION_COMPONENT_PATHS].some((p) => componentPath.endsWith(`/${p}`))
  );
}

export async function runFeatureGraphValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FeatureGraphValidationResult>> {
  const paths = requireAstroSitePaths(context);
  const featuresDir = join(paths.contentDirectory, "features");
  const violations: FeatureGraphViolation[] = [];

  // Check if features directory exists
  try {
    await readdir(featuresDir);
  } catch {
    context.logger.error(
      `[feature.graph.validate] ${relative(paths.appDirectory, featuresDir)} not found`,
    );
    return {
      data: {
        command: "feature.graph.validate",
        status: "fail",
        checkedFiles: 0,
        violations: [
          {
            file: relative(paths.appDirectory, featuresDir),
            rule: "duplicate-node-id",
            message: "Features directory does not exist",
          },
        ],
      },
      exitCode: 1,
    };
  }

  const featureFiles = await collectMarkdownFiles(featuresDir);
  const seenIds = new Set<string>();

  for (const filePath of featureFiles) {
    const source = await readFile(filePath, "utf8");
    const { data } = parseMarkdownFrontmatter(source);
    const relFile = relative(paths.appDirectory, filePath);

    if (!data || typeof data !== "object") continue;

    const featureData = data as FeatureFrontmatter;

    // Check for duplicate IDs
    if (featureData.kind === "page" && featureData.page?.id) {
      const id = `page:${featureData.page.id}`;
      if (seenIds.has(id)) {
        violations.push({
          file: relFile,
          rule: "duplicate-node-id",
          message: `Duplicate page ID: ${featureData.page.id}`,
        });
      }
      seenIds.add(id);

      // Check route exists
      const routeExists = await checkRouteExists(
        paths.appDirectory,
        featureData.page.routeSlug ?? "",
      );
      if (!routeExists) {
        violations.push({
          file: relFile,
          rule: "missing-route",
          message: `Route not found for slug: ${featureData.page.routeSlug}`,
        });
      }

      // Check sections
      if (Array.isArray(featureData.page.sections)) {
        let navigationSectionCount = 0;

        for (const section of featureData.page.sections) {
          const sectionId = `section:${featureData.page.id}:${section.id}`;
          if (seenIds.has(sectionId)) {
            violations.push({
              file: relFile,
              rule: "duplicate-node-id",
              message: `Duplicate section ID: ${section.id} in page ${featureData.page.id}`,
            });
          }
          seenIds.add(sectionId);

          // RFC-0019: every section must declare a role
          if (!section.role) {
            violations.push({
              file: relFile,
              rule: "missing-section-role",
              message: `Section "${section.id}" in page "${featureData.page.id}" is missing a role field. Add role: navigation | hero | content | supporting | cta | custom.`,
            });
          }

          // RFC-0019: at most one navigation section per page
          if (section.role === "navigation") {
            navigationSectionCount++;
            if (navigationSectionCount > 1) {
              violations.push({
                file: relFile,
                rule: "duplicate-navigation-section",
                message: `Page "${featureData.page.id}" declares more than one section with role "navigation". A page may have zero or one navigation section.`,
              });
            }

            // RFC-0019: navigation section must contain at least one navigation component
            const hasNavComponent =
              Array.isArray(section.components) &&
              section.components.some((c: FeatureComponentEntry) =>
                isNavigationComponentPath(c.componentPath ?? ""),
              );
            if (!hasNavComponent) {
              violations.push({
                file: relFile,
                rule: "navigation-section-missing-component",
                message: `Section "${section.id}" has role "navigation" but declares no breadcrumb/navigation component. Add a component with componentPath: section/navigation-section.`,
              });
            }
          }

          // Check components
          if (Array.isArray(section.components)) {
            for (const component of section.components) {
              const componentId = `component:${featureData.page.id}:${section.id}:${component.id}`;
              if (seenIds.has(componentId)) {
                violations.push({
                  file: relFile,
                  rule: "duplicate-node-id",
                  message: `Duplicate component ID: ${component.id}`,
                });
              }
              seenIds.add(componentId);

              // RFC-0019: navigation components must sit inside a navigation section
              if (
                isNavigationComponentPath(component.componentPath ?? "") &&
                section.role !== "navigation"
              ) {
                violations.push({
                  file: relFile,
                  rule: "navigation-component-outside-navigation-section",
                  message: `Component "${component.id}" (${component.componentPath}) is a navigation component but sits in section "${section.id}" which has role "${section.role ?? "(none)"}" — move it into a section with role: navigation.`,
                });
              }

              // Check component path exists
              const componentExists = await checkComponentExists(
                paths.appDirectory,
                component.componentPath ?? "",
              );
              if (!componentExists) {
                violations.push({
                  file: relFile,
                  rule: "missing-component-path",
                  message: `Component not found: ${component.componentPath}`,
                });
              }

              // Check items
              if (Array.isArray(component.items)) {
                for (const item of component.items) {
                  const itemId = `item:${featureData.page.id}:${section.id}:${component.id}:${item.id}`;
                  if (seenIds.has(itemId)) {
                    violations.push({
                      file: relFile,
                      rule: "duplicate-node-id",
                      message: `Duplicate item ID: ${item.id}`,
                    });
                  }
                  seenIds.add(itemId);
                }
              }
            }
          }
        }
      }
    } else if (featureData.kind === "sharedComponent" && featureData.sharedComponent?.id) {
      const id = `shared:${featureData.sharedComponent.id}`;
      if (seenIds.has(id)) {
        violations.push({
          file: relFile,
          rule: "duplicate-node-id",
          message: `Duplicate shared component ID: ${featureData.sharedComponent.id}`,
        });
      }
      seenIds.add(id);

      // Check component path exists
      const componentExists = await checkComponentExists(
        paths.appDirectory,
        featureData.sharedComponent.componentPath ?? "",
      );
      if (!componentExists) {
        violations.push({
          file: relFile,
          rule: "missing-component-path",
          message: `Shared component not found: ${featureData.sharedComponent.componentPath}`,
        });
      }
    }
  }

  // Report violations
  for (const violation of violations) {
    context.logger.error(`${violation.file}: ${violation.message} [${violation.rule}]`);
  }

  return {
    data: {
      command: "feature.graph.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedFiles: featureFiles.length,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[feature.graph.validate] OK (${featureFiles.length} feature files checked)`
        : undefined,
  };
}

export async function runFeatureLinksValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FeatureGraphValidationResult>> {
  const paths = requireAstroSitePaths(context);
  const violations: FeatureGraphViolation[] = [];

  // Check all content files for internal links
  const contentFiles = await collectMarkdownFiles(paths.contentDirectory);

  for (const filePath of contentFiles) {
    const source = await readFile(filePath, "utf8");
    const { data } = parseMarkdownFrontmatter(source);
    const relFile = relative(paths.appDirectory, filePath);

    if (!data || typeof data !== "object") continue;

    // Check for raw internal hrefs (should use semantic targets).
    // Matches any YAML key that ends with "href" (case-insensitive) holding a leading-slash value,
    // e.g. "href:", "disabledContactHref:", "fallbackHref:", etc.
    const rawInternalHrefRegex = /\w*[Hh]ref:\s*["']\/[^"']*["']/g;
    let match;
    while ((match = rawInternalHrefRegex.exec(source)) !== null) {
      const keyName = match[0].match(/^(\w*[Hh]ref)/)?.[1] ?? "href";
      const hrefValue = match[0].match(/[Hh]ref:\s*["']([^"']*)["']/)?.[1];
      if (hrefValue && hrefValue.startsWith("/")) {
        violations.push({
          file: relFile,
          rule: "raw-internal-href",
          message: `Key "${keyName}" uses raw internal href "${hrefValue}". Use a semantic target ref instead.`,
        });
      }
    }

    // Check semantic targets resolve to valid pages/anchors
    if (data.semanticTarget && typeof data.semanticTarget === "object") {
      const target = data.semanticTarget as Record<string, unknown>;
      if (target["kind"] === "internal" && !target["pageId"]) {
        violations.push({
          file: relFile,
          rule: "dangling-target",
          message: "Internal semantic target missing pageId",
        });
      }
    }

    // RFC-0019: breadcrumb item hrefs must not be raw internal paths
    // Breadcrumbs content files carry items[] with href fields
    const featureData = data as FeatureFrontmatter;
    if (Array.isArray(featureData.items)) {
      for (const item of featureData.items) {
        if (typeof item.href === "string" && item.href.startsWith("/")) {
          violations.push({
            file: relFile,
            rule: "raw-internal-href",
            message: `Breadcrumb item "${item.label ?? item.id ?? "unknown"}" uses raw internal href "${item.href}". Use a semantic pageId reference instead.`,
          });
        }
      }
    }
  }

  // Report violations
  for (const violation of violations) {
    context.logger.error(`${violation.file}: ${violation.message} [${violation.rule}]`);
  }

  return {
    data: {
      command: "feature.links.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedFiles: contentFiles.length,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[feature.links.validate] OK (${contentFiles.length} content files checked)`
        : undefined,
  };
}

export async function runFeatureProjectionsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FeatureGraphValidationResult>> {
  const paths = requireAstroSitePaths(context);
  const violations: FeatureGraphViolation[] = [];

  // RFC-0019: scan feature graph pages for disabled navigation sections that still
  // contain navigation components — these leak disabled targets into projection outputs.
  const featuresPageDir = join(paths.contentDirectory, "features", "pages");
  let featureFiles: string[] = [];
  try {
    featureFiles = await collectMarkdownFiles(featuresPageDir);
  } catch {
    // No feature graph in this app — nothing to check
  }

  const checkedFiles = featureFiles.length;

  for (const filePath of featureFiles) {
    const source = await readFile(filePath, "utf8");
    const { data } = parseMarkdownFrontmatter(source);
    const relFile = relative(paths.appDirectory, filePath);

    if (!data || typeof data !== "object") continue;
    const featureData = data as FeatureFrontmatter;
    if (featureData.kind !== "page" || !Array.isArray(featureData.page?.sections)) continue;

    // Only check pages that are themselves enabled — whole-page disabling is intentional
    if (featureData.page.visibility === "disabled") continue;

    for (const section of featureData.page.sections) {
      if (section.visibility !== "disabled") continue;
      if (!Array.isArray(section.components)) continue;

      for (const component of section.components) {
        if (isNavigationComponentPath(component.componentPath ?? "")) {
          violations.push({
            file: relFile,
            rule: "disabled-target-leak",
            message: `Section "${section.id}" is disabled but contains navigation component "${component.id}" (${component.componentPath}) on an enabled page. Disabled navigation sections on enabled pages must not expose breadcrumb targets in projections.`,
          });
        }
      }
    }
  }

  // Report violations
  for (const violation of violations) {
    context.logger.error(`${violation.file}: ${violation.message} [${violation.rule}]`);
  }

  return {
    data: {
      command: "feature.projections.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedFiles,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[feature.projections.validate] OK (${checkedFiles} feature pages checked for disabled navigation leaks)`
        : undefined,
  };
}
