/* 
<MODULE_CONTRACT> 
<purpose>Maintains packages/os/site-kernel-checks/src/content-surface.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
 
 
<non-goals> 
  <item>Do not remove src/scripts/layout-orchestrator.ts or src/styles/**.</item>
  <item>Do not validate package-level cosmic contracts (handled elsewhere).</item>
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Initial implementation for RFC-0047 CMS-friendly thin app content surface validation.</item>
  <item>Recognize generated public preview, image-variant, video-variant, and starmap artifacts as intentional public exceptions.</item>
  <item>Accepted public-readiness RFCs: allow humans.txt, llms files, and app-derived IndexNow verification keys in public/.</item>
  <item>RFC-0309: allow generated installable icon PNG/ICO assets in public/.</item>
</CHANGE_SUMMARY> 
*/

import { basename, dirname, join, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileExists } from "./lib/file-exists.ts";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectMarkdownFiles } from "@warpgogol/site-kernel-content";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { diagnosticsResult } from "./result-helpers.ts";

interface ContentSurfaceViolation {
  file: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

// @ai-invariant These constants define the CMS-friendly content surface per RFC-0047.
// Changing these paths breaks the content surface validation for all apps.
const CMS_CONTENT_DOMAINS = ["pages", "prose", "business", "navigation", "site"] as const;
const LEGACY_CONTENT_FOLDERS = ["components", "sections", "features", "layouts"] as const;
const FORBIDDEN_CONTENT_FOLDERS = ["media"] as const;
const PUBLIC_EXCEPTION_PATTERNS = [
  /^favicon\./,
  /^manifest\./,
  /^apple-touch-icon\.png$/,
  /^icon(?:-maskable)?-(?:192|512)\.png$/,
  /^robots\./,
  /^sitemap\./,
  /^humans\.txt$/,
  /^llms(?:-full)?\.txt$/,
  /^[A-Za-z0-9-]+-indexnow\.txt$/,
  /^og-image\.png$/,
  /^\.well-known\//,
  /^preview\//,
  /^_img\//,
  /^_video\//,
  /^textures\/section-noise\.svg$/,
  /^_headers$/,
  /^_redirects$/,
  /^ads\.txt$/,
  /^security\.txt$/,
] as const;

async function collectLangSubdirs(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory() && /^[a-z]{2}$/i.test(e.name)).map((e) => e.name);
}

async function collectAllFiles(dir: string, extensions: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectAllFiles(fullPath, extensions)));
    } else if (entry.isFile()) {
      if (extensions.length === 0 || extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function checkLegacySchemaSurface(
  paths: any,
  violations: ContentSurfaceViolation[],
): Promise<void> {
  const componentSchemasDir = join(paths.contentDirectory, "schemas", "components");
  const componentDispatcherPath = join(
    paths.contentDirectory,
    "schemas",
    "components-dispatcher.ts",
  );

  if (await fileExists(componentSchemasDir)) {
    violations.push({
      file: relative(paths.appDirectory, componentSchemasDir),
      rule: "legacy-component-schemas",
      severity: "error",
      message:
        "App-local src/content/schemas/components is no longer supported. Component contracts must live in packages/* and modern app content domains.",
    });
  }

  if (await fileExists(componentDispatcherPath)) {
    violations.push({
      file: relative(paths.appDirectory, componentDispatcherPath),
      rule: "legacy-components-dispatcher",
      severity: "error",
      message:
        "src/content/schemas/components-dispatcher.ts is no longer supported. Do not preserve app-local component dispatcher compatibility.",
    });
  }
}

function isPublicException(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  return PUBLIC_EXCEPTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

async function checkSystemManifest(
  paths: any,
  violations: ContentSurfaceViolation[],
  _warnings: ContentSurfaceViolation[],
): Promise<void> {
  const systemYamlPath = join(paths.appDirectory, "system.yaml");
  const systemMdPath = join(paths.contentDirectory, "system.md");
  const legacySystemMdPath = join(paths.contentDirectory, "assets", "system.md");

  const hasSystemYaml = await fileExists(systemYamlPath);
  const hasSystemMd = await fileExists(systemMdPath);
  const hasLegacySystemMd = await fileExists(legacySystemMdPath);

  if (hasSystemYaml) {
    violations.push({
      file: relative(paths.appDirectory, systemYamlPath),
      rule: "legacy-system-yaml",
      severity: "error",
      message:
        "system.yaml is no longer supported. Use only src/content/system.md as the canonical manifest.",
    });
  }

  if (hasLegacySystemMd) {
    violations.push({
      file: relative(paths.appDirectory, legacySystemMdPath),
      rule: "legacy-system-md",
      severity: "error",
      message: "src/content/assets/system.md is deprecated. Move content to src/content/system.md.",
    });
  }

  if (!hasSystemMd) {
    violations.push({
      file: "src/content/system.md",
      rule: "missing-system-md",
      severity: "error",
      message: "Required src/content/system.md not found. This is the canonical system manifest.",
    });
  }
}

async function checkContentFolders(
  paths: any,
  violations: ContentSurfaceViolation[],
  warnings: ContentSurfaceViolation[],
): Promise<void> {
  const contentDir = paths.contentDirectory;
  let entries;
  try {
    entries = await readdir(contentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Check for required CMS content domains
  for (const domain of CMS_CONTENT_DOMAINS) {
    if (!folders.includes(domain)) {
      warnings.push({
        file: `src/content/${domain}`,
        rule: "missing-cms-domain",
        severity: "warning",
        message: `CMS-friendly content domain '${domain}' not found. Consider adding it for better content organization.`,
      });
    }
  }

  // Check for legacy folders that should be removed after migration
  for (const legacy of LEGACY_CONTENT_FOLDERS) {
    if (folders.includes(legacy)) {
      violations.push({
        file: `src/content/${legacy}`,
        rule: "legacy-content-folder",
        severity: "error",
        message: `Legacy folder 'src/content/${legacy}' is not part of the CMS-first content surface. Migrate and remove this folder.`,
      });
    }
  }

  // Check for forbidden folders
  for (const forbidden of FORBIDDEN_CONTENT_FOLDERS) {
    if (folders.includes(forbidden)) {
      violations.push({
        file: `src/content/${forbidden}`,
        rule: "forbidden-content-folder",
        severity: "error",
        message: `Folder 'src/content/${forbidden}' is forbidden. Use content-local assets/** instead.`,
      });
    }
  }
}

async function checkAssetsStructure(
  paths: any,
  violations: ContentSurfaceViolation[],
  warnings: ContentSurfaceViolation[],
): Promise<void> {
  const contentDir = paths.contentDirectory;

  // Check for content-local assets folders
  for (const domain of CMS_CONTENT_DOMAINS) {
    const domainDir = join(contentDir, domain);
    const langDirs = await collectLangSubdirs(domainDir);

    for (const lang of langDirs) {
      const langDir = join(domainDir, lang);
      const assetsDir = join(langDir, "assets");

      if (await fileExists(assetsDir)) {
        // Verify assets folder contains actual assets
        const assetFiles = await collectAllFiles(assetsDir);
        if (assetFiles.length === 0) {
          warnings.push({
            file: relative(paths.appDirectory, assetsDir),
            rule: "empty-assets-folder",
            severity: "warning",
            message: "Empty assets folder found. Remove it or add content-owned assets.",
          });
        }
      }
    }
  }
}

async function checkPublicFolder(
  paths: any,
  violations: ContentSurfaceViolation[],
  warnings: ContentSurfaceViolation[],
): Promise<void> {
  const publicDir = paths.publicDirectory;
  const files = await collectAllFiles(publicDir);

  for (const file of files) {
    const relPath = relative(publicDir, file);
    const filename = basename(relPath);

    if (!isPublicException(relPath)) {
      // Check if it's an image file that should be in content-local assets
      const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg"];
      if (imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext))) {
        warnings.push({
          file: relative(paths.appDirectory, file),
          rule: "public-exception-review",
          severity: "warning",
          message:
            "Image file in public/ should be in content-local assets/** for Astro optimization. Verify this file must bypass optimization.",
        });
      }
    }
  }
}

async function checkPageBlocks(
  paths: any,
  violations: ContentSurfaceViolation[],
  warnings: ContentSurfaceViolation[],
): Promise<void> {
  const pagesDir = join(paths.contentDirectory, "pages");
  const langDirs = await collectLangSubdirs(pagesDir);

  for (const lang of langDirs) {
    const langDir = join(pagesDir, lang);
    const mdFiles = await collectMarkdownFiles(langDir);

    for (const file of mdFiles) {
      try {
        const content = await readFile(file, "utf8");
        const lines = content.split("\n");

        let inFrontmatter = false;
        let frontmatterEnd = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (i === 0 && line === "---") {
            inFrontmatter = true;
            continue;
          }

          if (inFrontmatter && line === "---") {
            frontmatterEnd = true;
            inFrontmatter = false;
            continue;
          }

          if (inFrontmatter) {
            // Check for cosmic names in blocks[].use
            if (line.includes("use:") && !line.includes("type:")) {
              const match = line.match(/use:\s*(\w+)/);
              if (match) {
                const cosmicName = match[1];
                // Check if it looks like a cosmic name (capitalized, like planet names)
                if (/^[A-Z][a-z]+$/.test(cosmicName)) {
                  violations.push({
                    file: relative(paths.appDirectory, file),
                    rule: "cosmic-name-in-page",
                    severity: "error",
                    message: `Page block uses cosmic name '${cosmicName}'. Use author-facing 'type:' field instead of 'use:'.`,
                  });
                }
              }
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }
}

/**
 * Validates CMS-friendly thin app content surface per RFC-0047.
 *
 * Rules enforced:
 * - Single src/content/system.md manifest (no system.yaml + assets/system.md pair)
 * - Semantic content folders: pages, prose, business, navigation, site
 * - No legacy components, sections, features, layouts, or app-local component schema/dispatcher folders
 * - No media/ folder (use content-local assets/**)
 * - Public/ contains only fixed-path exceptions
 * - Page blocks use author-facing types, not cosmic names
 *
 * @rfc RFC-0047
 */
export async function runContentSurfaceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const violations: ContentSurfaceViolation[] = [];
  const warnings: ContentSurfaceViolation[] = [];

  // Check system manifest structure
  await checkSystemManifest(paths, violations, warnings);

  // Check content folder structure
  await checkContentFolders(paths, violations, warnings);

  // Check app-local legacy schema and dispatcher compatibility surfaces
  await checkLegacySchemaSurface(paths, violations);

  // Check assets structure
  await checkAssetsStructure(paths, violations, warnings);

  // Check public folder usage
  await checkPublicFolder(paths, violations, warnings);

  // Check page blocks for cosmic names
  await checkPageBlocks(paths, violations, warnings);

  const diagnostics: Diagnostic[] = [...violations, ...warnings].map((item) => ({
    ruleId: "content.surface.validate",
    severity: item.severity,
    file: item.file,
    message: item.message,
    fixHint:
      item.severity === "warning"
        ? "Review the CMS-friendly content surface and either complete the domain/asset structure or remove the unused folder."
        : "Update the app content structure to match the RFC-0047 CMS-friendly surface.",
    data: { rule: item.rule },
  }));

  return diagnosticsResult("content.surface.validate", diagnostics);
}
