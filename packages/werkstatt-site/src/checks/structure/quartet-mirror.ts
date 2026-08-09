/*
<MODULE_CONTRACT>
<purpose>mirror.quartet.validate — validates the four-way quartet mirror for
content-driven Astro components (RFC-0009) and enforces slug/route-stem
alignment for page routes (RFC-0014).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of structure.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { basename, dirname, join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { fileExists } from "../lib/file-exists.ts";
import { PAGES_NON_ROUTE_SUBDIRS } from "../lib/route-constants.ts";
import {
  CONTENT_COMPONENTS_SUBPATH,
  SCHEMAS_SUBPATH,
  collectComponentPaths,
  collectTsFiles,
} from "./shared.ts";

// @ai-invariant QUARTET paths mirror the TRIAD paths plus two new legs:
//   src/components/{path}/{Name}.astro         (Q-01: always required for content-driven components)
//   src/styles/components/{path}/{name}.css    (Q-04: always required for content-driven components)
//   public/scripts/components/{path}/{name}.js (Q-02/Q-05: required only when @client-script: required is in .astro)
// public/scripts/ mirrors src/styles/ hierarchy: components/ for components, pages/ for pages.
// A component is content-driven when it has BOTH a schema .ts AND a content .md (i.e. passes triad).
// Q-03 (orphan script) is a warning only — exit code stays 0 when the only violations are Q-03.
//
// @ai-invariant RFC-0020: Layer suffixes (-component, -section) are stripped when building
// astroPaths so that schema path "header" matches "header-component.astro". The SUFFIX_MAP
// stores the actual filename stem (with suffix) for each logical path so that Q-02/Q-04/Q-05
// probe the correct physical file path.
const LAYER_SUFFIXES_QUARTET = ["-component", "-section"] as const;

// @ai-invariant PAGE_ENTRY_FALLBACK_RE matches every getPageEntryWithFallback(lang, "<slug>")
// call in Astro route files. Capture group 1 is the slug string literal.
// Update this regex if the helper is ever renamed (RFC-0008).
const PAGE_ENTRY_FALLBACK_RE = /getPageEntryWithFallback\s*\(\s*\w+\s*,\s*["']([^"']+)["']/g;
const CLIENT_SCRIPT_DIRECTIVE = "@client-script: required";

async function collectAstroRouteFiles(pagesDir: string): Promise<string[]> {
  // PAGES_NON_ROUTE_SUBDIRS only applies at the top level of pagesDir (a nested
  // directory that happens to share a name is not excluded), so the top level is
  // enumerated separately from the uniform-ignore recursive collect.
  const { readdir } = await import("node:fs/promises");
  let topEntries;
  try {
    topEntries = await readdir(pagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of topEntries) {
    if (entry.isDirectory()) {
      if (PAGES_NON_ROUTE_SUBDIRS.has(entry.name)) continue;
      results.push(
        ...(await collectFiles(join(pagesDir, entry.name), {
          extensions: [".astro"],
          ignore: () => false,
        })),
      );
    } else if (entry.isFile() && entry.name.endsWith(".astro")) {
      results.push(join(pagesDir, entry.name));
    }
  }
  return results;
}

async function collectAstroFiles(dirPath: string): Promise<string[]> {
  return collectFiles(dirPath, { extensions: [".astro"], ignore: () => false });
}

async function collectJsFiles(dirPath: string): Promise<string[]> {
  return collectFiles(dirPath, { extensions: [".js"], ignore: () => false });
}

async function hasClientScriptDirective(astroFilePath: string): Promise<boolean> {
  try {
    const content = await readFile(astroFilePath, "utf8");
    return content.includes(CLIENT_SCRIPT_DIRECTIVE);
  } catch {
    return false;
  }
}

/**
 * Validates the four-way quartet mirror for content-driven Astro components (RFC-0009)
 * and enforces slug/route-stem alignment for page routes (RFC-0014).
 *
 * Component rules (Q-01..Q-05):
 *   Q-01  schemas/components/{p}.ts exists but src/components/{p}.astro is missing  → error
 *   Q-02  src/components/{p}.astro has @client-script: required but public/scripts/{p}.js missing → error
 *   Q-03  public/scripts/{p}.js exists but src/components/{p}.astro is missing  → warning (exit 0)
 *   Q-04  content-driven src/components/{p}.astro has no src/styles/components/{p}.css  → error
 *   Q-05  src/components/{p}.astro declares @client-script: required but script name != component name → error
 *         (covered by Q-02 path convention; name drift caught as missing file at canonical path)
 *
 * Page route rule (QP-01):
 *   QP-01 src/pages/[lang]/{name}.astro calls getPageEntryWithFallback(lang, "<slug>")
 *         where slug ≠ name  → error
 *
 * @rfc RFC-0009
 * @rfc RFC-0014
 */
export async function runQuartetMirrorValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number; warnings: number }>> {
  const paths = requireAstroSitePaths(context);

  const contentComponentsDir = join(paths.contentDirectory, CONTENT_COMPONENTS_SUBPATH);
  const schemasComponentsDir = join(paths.contentDirectory, SCHEMAS_SUBPATH);
  const componentsDir = join(paths.srcDirectory, "components");
  const stylesComponentsDir = join(paths.srcDirectory, "styles", "components");
  // public/scripts/components/ mirrors src/styles/components/ — same subpath convention.
  // public/scripts/pages/ would mirror src/styles/pages/ when page scripts are introduced.
  const scriptsDir = join(paths.publicDirectory, "scripts", "components");

  // Build the set of content-driven component paths (intersection of schema + content).
  const contentPaths = await collectComponentPaths(contentComponentsDir);
  const schemaTsFiles = await collectTsFiles(schemasComponentsDir);
  const schemaPaths = new Set<string>();
  for (const file of schemaTsFiles) {
    const rel = relative(schemasComponentsDir, file).replace(/\\/g, "/").replace(/\.ts$/i, "");
    schemaPaths.add(rel);
  }
  // Content-driven = has BOTH a schema and a content file (already validated by triad)
  const contentDrivenPaths = new Set<string>();
  for (const p of schemaPaths) {
    if (contentPaths.has(p)) contentDrivenPaths.add(p);
  }

  if (contentDrivenPaths.size === 0) {
    return {
      data: { violations: 0, warnings: 0 },
      exitCode: 0,
      summary: "[mirror.quartet] OK (no content-driven components found)",
    };
  }

  // Collect existing .astro paths from src/components/ AND src/layouts/ (Class 4 layout components).
  // Both directories are scanned; paths are normalised relative to src/components/ so that
  // a layout schema "layout" resolves to "layout" in both src/components/layout.astro and
  // src/layouts/layout.astro.
  //
  // RFC-0020: When a file stem ends with an approved layer suffix (e.g. "header-component"),
  // we also register the logical identity ("header") in astroPaths. suffixMap records
  // the actual physical stem for each logical path so Q-02/Q-04 probe the correct file.
  const layoutsDir = join(paths.srcDirectory, "layouts");
  const astroFiles = [
    ...(await collectAstroFiles(componentsDir)),
    ...(await collectAstroFiles(layoutsDir)),
  ];
  const astroPaths = new Set<string>();
  const layoutOnlyPaths = new Set<string>(); // paths whose .astro lives in src/layouts/, not src/components/
  // Maps logical identity → physical stem (e.g. "header" → "header-component")
  const suffixMap = new Map<string, string>();
  for (const file of astroFiles) {
    // Normalise against componentsDir first; fall back to layoutsDir so the stem is always
    // just the component name (e.g. "layout", "section/hero-section").
    let rel = "";
    if (file.startsWith(componentsDir)) {
      rel = relative(componentsDir, file)
        .replace(/\\/g, "/")
        .replace(/\.astro$/i, "");
    } else {
      rel = relative(layoutsDir, file)
        .replace(/\\/g, "/")
        .replace(/\.astro$/i, "");
      layoutOnlyPaths.add(rel);
    }
    astroPaths.add(rel);
    // RFC-0020: also register stripped logical identity
    for (const suffix of LAYER_SUFFIXES_QUARTET) {
      const lastSlash = rel.lastIndexOf("/");
      const name = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
      const dir = lastSlash >= 0 ? rel.slice(0, lastSlash + 1) : "";
      if (name.endsWith(suffix)) {
        const logical = `${dir}${name.slice(0, name.length - suffix.length)}`;
        astroPaths.add(logical);
        suffixMap.set(logical, rel); // logical → physical stem
        if (file.startsWith(layoutsDir) && !file.startsWith(componentsDir)) {
          layoutOnlyPaths.add(logical);
        }
        break;
      }
    }
  }

  // Wave 7 (RFC-0023): Also scan packages/ui/src/{sections,components}/ for components that
  // have been promoted to the shared package. Their schema + content files stay in the app;
  // only the .astro and colocated CSS live in the package. We register their logical paths in
  // astroPaths so Q-01 does not fire, and record their colocated CSS paths so Q-04 can find them.
  const uiPackageSectionsDir = join(context.workspaceRoot, "packages", "ui", "src", "sections");
  const uiPackageComponentsDir = join(context.workspaceRoot, "packages", "ui", "src", "components");
  // Maps physical stem (e.g. "section/hero-section") → absolute path of colocated CSS
  const uiColocatedCssMap = new Map<string, string>();

  const uiSectionAstroFiles = await collectAstroFiles(uiPackageSectionsDir);
  for (const file of uiSectionAstroFiles) {
    const stem = basename(file, ".astro"); // e.g. "hero-section"
    const rel = `section/${stem}`; // e.g. "section/hero-section"
    astroPaths.add(rel);
    for (const suffix of LAYER_SUFFIXES_QUARTET) {
      if (stem.endsWith(suffix)) {
        const logical = `section/${stem.slice(0, stem.length - suffix.length)}`;
        astroPaths.add(logical);
        suffixMap.set(logical, rel);
        break;
      }
    }
    uiColocatedCssMap.set(rel, join(dirname(file), `${stem}.css`));
  }

  const uiComponentAstroFiles = await collectAstroFiles(uiPackageComponentsDir);
  for (const file of uiComponentAstroFiles) {
    const stem = basename(file, ".astro"); // e.g. "header-component"
    astroPaths.add(stem);
    for (const suffix of LAYER_SUFFIXES_QUARTET) {
      if (stem.endsWith(suffix)) {
        const logical = stem.slice(0, stem.length - suffix.length);
        astroPaths.add(logical);
        suffixMap.set(logical, stem);
        break;
      }
    }
    uiColocatedCssMap.set(stem, join(dirname(file), `${stem}.css`));
  }

  const scriptFiles = await collectJsFiles(scriptsDir);
  const scriptPaths = new Set<string>();
  for (const file of scriptFiles) {
    const rel = relative(scriptsDir, file).replace(/\\/g, "/").replace(/\.js$/i, "");
    scriptPaths.add(rel);
  }

  let violations = 0;
  let warnings = 0;

  // Q-01: content-driven schema → no .astro
  for (const p of contentDrivenPaths) {
    if (!astroPaths.has(p)) {
      context.logger.error(
        `[Q-01] src/components/${p}.astro missing — required for content-driven component schemas/components/${p}.ts`,
      );
      violations += 1;
    }
  }

  // Q-02, Q-04, Q-05: per .astro checks
  for (const p of contentDrivenPaths) {
    if (!astroPaths.has(p)) continue; // already reported as Q-01

    // RFC-0020: resolve the physical stem (with layer suffix) if the logical path has a mapping.
    // e.g. logical "header" → physical stem "header-component" (header-component.astro exists).
    const physicalStem = suffixMap.get(p) ?? p;

    // Class 4 layout components live in src/layouts/ — use correct absolute path for directive scan.
    const isLayout = layoutOnlyPaths.has(p);
    const astroAbsPath = isLayout
      ? join(layoutsDir, `${physicalStem}.astro`)
      : join(componentsDir, `${physicalStem}.astro`);
    // RFC-0020 extended: src/styles/components/ also uses the physical stem with layer suffix.
    // e.g. logical "footer" → physicalStem "footer-component" → footer-component.css
    const cssAbsPath = join(stylesComponentsDir, `${physicalStem}.css`);
    // RFC-0020: public/scripts/ uses the logical identity (p) — scripts stay suffix-free.
    const scriptAbsPath = join(scriptsDir, `${p}.js`);

    // Q-04: content-driven .astro → no CSS (skip for Class 4 layout components in src/layouts/)
    // Wave 7: components promoted to packages/ui have colocated CSS — check there first.
    if (!isLayout) {
      let cssExists = await fileExists(cssAbsPath);
      if (!cssExists) {
        const uiCssPath = uiColocatedCssMap.get(physicalStem) ?? uiColocatedCssMap.get(p);
        if (uiCssPath) cssExists = await fileExists(uiCssPath);
      }
      if (!cssExists) {
        context.logger.error(
          `[Q-04] src/styles/components/${p}.css missing — required for content-driven component src/components/${p}.astro`,
        );
        violations += 1;
      }
    }

    // Q-02 / Q-05: @client-script: required → script must exist at canonical path
    const needsScript = await hasClientScriptDirective(astroAbsPath);
    if (needsScript) {
      const scriptExists = await fileExists(scriptAbsPath);
      if (!scriptExists) {
        context.logger.error(
          `[Q-02] public/scripts/${p}.js missing — src/components/${p}.astro declares @client-script: required`,
        );
        violations += 1;
      }
    }
  }

  // Q-03: orphan script (exists but no matching .astro) — warning only
  for (const scriptPath of scriptPaths) {
    if (!astroPaths.has(scriptPath)) {
      context.logger.warn(
        `[Q-03] public/scripts/${scriptPath}.js has no matching src/components/${scriptPath}.astro — orphan script`,
      );
      warnings += 1;
    }
  }

  // QP-01: page route slug must match route file stem (RFC-0014)
  const pagesDir = join(paths.srcDirectory, "pages");
  const routeFiles = await collectAstroRouteFiles(pagesDir);
  for (const filePath of routeFiles) {
    const stem = basename(filePath, ".astro");
    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    PAGE_ENTRY_FALLBACK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PAGE_ENTRY_FALLBACK_RE.exec(source)) !== null) {
      const slug = match[1];
      if (slug !== stem) {
        const line = source.slice(0, match.index).split("\n").length;
        context.logger.error(
          `${rel}:${line}: [QP-01] slug "${slug}" does not match route stem "${stem}" — rename the content file or the route`,
        );
        violations += 1;
      }
    }
  }

  const ok = violations === 0;
  return {
    data: { violations, warnings },
    exitCode: ok ? 0 : 1,
    summary: ok
      ? `[mirror.quartet] OK (${contentDrivenPaths.size} content-driven components, ${routeFiles.length} page routes checked${warnings > 0 ? `, ${warnings} warning(s)` : ""})`
      : undefined,
  };
}
