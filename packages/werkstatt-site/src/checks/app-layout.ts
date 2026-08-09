/*
<MODULE_CONTRACT>
<purpose>
Implements app.layout.validate — the OS command that enforces the feature-first
app layout contract (DNA-21, RFC-0025; amended by RFC-0031):
  - src/assets/images/ must not exist (forbidden legacy parallel tree).
  - Per-feature CSS files are forbidden everywhere except src/styles/ (ERROR-level).
  - src/styles/tokens-override.css must not exist (biome tokens via system.yaml only).
  - src/content/ must exist (feature-first layout required).
  - src/content/** /assets/ is the canonical editable source-asset surface (RFC-0031).
  - Content collections must follow the DNA-21 directory structure.
</purpose>
<non-goals>
  <item>Do not validate manifest content — manifest.contract.validate handles that.</item>
  <item>Do not validate biome YAML — biome.contract.validate handles that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>Wave 2 (RFC-0031): Updated asset rules to allow src/content/** /assets/ as canonical editable surface.</item>
</CHANGE_SUMMARY>
*/

import { readdir, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { fileExists } from "./lib/file-exists.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** Recursively collect CSS files under a directory, excluding src/styles/. */
async function collectCssOutsideStyles(appSrc: string, stylesDir: string): Promise<string[]> {
  const stylesDirName = basename(stylesDir);
  return collectFiles(appSrc, { extensions: [".css"], ignore: (name) => name === stylesDirName });
}

// ---------------------------------------------------------------------------
// app.layout.validate
// ---------------------------------------------------------------------------

interface LayoutViolation {
  path: string;
  rule: string;
  message: string;
}

interface AppLayoutResult {
  appsScanned: number;
  violations: number;
  details: LayoutViolation[];
}

/**
 * Validates the feature-first app layout contract (DNA-21, RFC-0025, RFC-0031) for
 * all apps (workspace scope) or a single app (app scope).
 *
 * Checks:
 *   L-01: src/assets/images/ must not exist (legacy parallel tree)
 *   L-02: src/styles/tokens-override.css must not exist
 *   L-03: src/content/ must exist
 *   L-04: No per-feature CSS outside src/styles/
 *   L-05: system.yaml must exist at app root
 *   L-06: Raster images must be in canonical locations (src/content/** /assets/ or src/assets/)
 *
 * All rules are ERROR-level. Exits non-zero on any violation.
 */
export async function runAppLayoutValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AppLayoutResult>> {
  const appsDir = join(context.workspaceRoot, "apps");

  let appEntries: string[] = [];
  try {
    appEntries = await readdir(appsDir);
  } catch {
    context.logger.warn("app.layout.validate: no apps/ directory found");
    return {
      data: { appsScanned: 0, violations: 0, details: [] },
      exitCode: 0,
    };
  }

  if (context.site?.directory) {
    const slug = context.site.directory.split(/[/\\]/).pop() ?? "";
    appEntries = appEntries.filter((e) => e === slug);
  }

  const details: LayoutViolation[] = [];
  let appsScanned = 0;

  for (const appSlug of appEntries) {
    const appDir = join(appsDir, appSlug);
    const appSrc = join(appDir, "src");

    // Only process actual app directories
    if (!(await dirExists(appSrc))) continue;
    appsScanned++;

    const stylesDir = join(appSrc, "styles");

    // ── L-01: src/assets/images/ must not exist (legacy parallel tree) ────
    const assetsImages = join(appSrc, "assets", "images");
    if (await dirExists(assetsImages)) {
      const rel = relative(context.workspaceRoot, assetsImages);
      const msg =
        "src/assets/images/ is forbidden (RFC-0031). " +
        "Legacy parallel tree. Use src/content/**/assets/ for editable feature assets or src/assets/ for app-global assets. " +
        "Delete this directory.";
      details.push({ path: rel, rule: "L-01", message: msg });
      context.logger.error(`${rel}: ${msg}`);
    }

    // ── L-06: Raster images must be in canonical locations ─────────────────
    // Canonical locations per RFC-0031:
    //   - src/content/**/assets/ (editable feature-owned source assets)
    //   - src/assets/ (app-global imported assets, NOT src/assets/images/)
    // Forbidden: anywhere else in src/
    const rasterExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]);

    async function collectRasterImages(dir: string): Promise<string[]> {
      const all = await collectFiles(dir);
      return all.filter((full) => rasterExtensions.has(extname(full).toLowerCase()));
    }

    const allRaster = await collectRasterImages(appSrc);
    for (const rasterPath of allRaster) {
      const relSrc = relative(appSrc, rasterPath).replace(/\\/g, "/");
      const relWs = relative(context.workspaceRoot, rasterPath);

      // Check if in canonical location
      const isInContentAssets = relSrc.includes("/assets/") && relSrc.startsWith("content/");
      const isInAssetsRoot = relSrc.startsWith("assets/") && !relSrc.startsWith("assets/images/");

      if (!isInContentAssets && !isInAssetsRoot) {
        const msg =
          `Raster image at ${relSrc} is outside canonical locations (RFC-0031). ` +
          `Place in src/content/**/assets/ (editable feature assets) or src/assets/ (app-global assets).`;
        details.push({ path: relWs, rule: "L-06", message: msg });
        context.logger.error(`${relWs}: ${msg}`);
      }
    }

    // ── L-02: src/styles/tokens-override.css must not exist ──────────────
    const tokensOverride = join(stylesDir, "tokens-override.css");
    if (await fileExists(tokensOverride)) {
      const rel = relative(context.workspaceRoot, tokensOverride);
      const msg =
        "src/styles/tokens-override.css is forbidden (RFC-0025). " +
        "Token overrides are declared in system.yaml identity.biome and " +
        "generated by the biome-css codegen command.";
      details.push({ path: rel, rule: "L-02", message: msg });
      context.logger.error(`${rel}: ${msg}`);
    }

    // ── L-03: src/content/ must exist ─────────────────────────────────────
    const contentDir = join(appSrc, "content");
    if (!(await dirExists(contentDir))) {
      const rel = relative(context.workspaceRoot, contentDir);
      const msg =
        "src/content/ is required by the feature-first layout (DNA-21, RFC-0025). " +
        "Create src/content/ with at least one layer subdirectory.";
      details.push({ path: rel, rule: "L-03", message: msg });
      context.logger.error(`${rel}: ${msg}`);
    }

    // ── L-04: No per-feature CSS outside src/styles/ ──────────────────────
    const perFeatureCss = await collectCssOutsideStyles(appSrc, stylesDir);
    for (const cssFile of perFeatureCss) {
      const rel = relative(context.workspaceRoot, cssFile);
      const msg =
        "Per-feature CSS is forbidden outside src/styles/ (DNA-23, RFC-0025). " +
        "Use biome tokens or move to src/styles/.";
      details.push({ path: rel, rule: "L-04", message: msg });
      context.logger.error(`${rel}: ${msg}`);
    }

    // ── L-05: system manifest must exist ─────────────────────────────────
    try {
      await loadSystemManifest(contentDir);
    } catch {
      const rel = relative(context.workspaceRoot, join(contentDir, "system.md"));
      const msg =
        "system manifest is missing (DNA-23, RFC-0025, RFC-0047). " +
        "Create apps/<app>/src/content/system.md with identity.systemStar and identity.biome.";
      details.push({ path: rel, rule: "L-05", message: msg });
      context.logger.error(`${rel}: ${msg}`);
    }
  }

  if (details.length === 0) {
    context.logger.info(
      `app.layout.validate: OK — ${appsScanned} app${appsScanned === 1 ? "" : "s"} pass layout contract`,
    );
  }

  return {
    data: { appsScanned, violations: details.length, details },
    exitCode: details.length > 0 ? 1 : 0,
    summary: details.length === 0 ? `OK — ${appsScanned} apps pass layout contract` : undefined,
  };
}
