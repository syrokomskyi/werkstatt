/*
<MODULE_CONTRACT>
<purpose>assets.structure.lint — RFC-0025/0031: raster images must live in a content asset
folder (editable source assets) or src/assets/ (app-global imports), never in
src/assets/images/ (legacy parallel tree) or anywhere else under src/.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of naming.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { walkForExtension } from "./shared.ts";

// @ai-invariant RASTER_IMAGE_EXTENSIONS defines which file extensions are treated as raster
// images by assets.structure.lint. SVG is intentionally excluded: SVGs are processed by Vite
// and may live in src/assets/icons/ as icon source files.
// Raster images are FORBIDDEN under src/ as of RFC-0025 (DNA-21). They must live in
// public/images/ or a CDN. This set is used to detect violations anywhere under src/.
const RASTER_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]);

// [RFC-0031] Raster images are allowed in src/content/**/assets/ (canonical
// editable source-asset surface) and src/assets/ (app-global imported assets).
// They are FORBIDDEN in src/assets/images/ (legacy parallel tree) and elsewhere
// in src/ outside the canonical locations.
export async function runAssetsStructureLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number; violations: number }>> {
  const paths = requireAstroSitePaths(context);

  const violations: string[] = [];

  // Collect all raster image files found anywhere under src/.
  const SKIP_DIRS = new Set(["node_modules", "dist", ".astro"]);
  const imageFiles: string[] = [];
  await walkForExtension(
    paths.srcDirectory,
    (name) => {
      const ext = "." + name.split(".").pop()!.toLowerCase();
      return RASTER_IMAGE_EXTENSIONS.has(ext);
    },
    imageFiles,
    SKIP_DIRS,
  );

  const checkedFiles = imageFiles.length;
  for (const filePath of imageFiles) {
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    const relSrc = relative(paths.srcDirectory, filePath).replace(/\\/g, "/");

    // Allow raster images in src/content/**/assets/ (RFC-0031 canonical)
    if (relSrc.includes("/assets/") && relSrc.startsWith("content/")) {
      continue;
    }

    // Allow raster images directly in src/assets/ (app-global imports), but NOT in src/assets/images/
    if (relSrc.startsWith("assets/")) {
      if (relSrc.startsWith("assets/images/")) {
        violations.push(
          `${rel}: raster image in src/assets/images/ is forbidden (RFC-0031). Legacy parallel tree. Move to src/content/**/assets/ or src/assets/.`,
        );
      }
      continue;
    }

    // Forbid raster images elsewhere in src/
    violations.push(
      `${rel}: raster image inside src/ is forbidden outside canonical locations (RFC-0031). Place in src/content/**/assets/ or src/assets/.`,
    );
  }

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { checkedFiles, violations: violations.length },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[assets.structure.lint] OK — raster images in canonical locations only (${checkedFiles} checked)`
        : undefined,
  };
}
