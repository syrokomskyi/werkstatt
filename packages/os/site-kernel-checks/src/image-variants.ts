/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0204] Site OS commands for the build-portable image provider.
  `image.variants.generate` — use sharp at build time to pre-generate width
  variants for every content asset image into public/_img/<hash>/<width>.webp
  and write src/image-variants.generated.yaml so the build-portable ImageProvider
  can emit a real responsive srcset WITHOUT Cloudflare Image Transformations.
  `image.variants.validate` — confirm the manifest is present and every listed
  variant file exists under public/_img/.
</purpose>
<non-goals>
  <item>Do not import or use Astro internals (astro:assets, getImage, Image component).</item>
  <item>Do not run at all when PUBLIC_IMAGE_PROVIDER != build-portable (no-op pass).</item>
  <item>Do not optimize images that are referenced only by decorative/non-managed paths.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0204: introduced image.variants.generate and image.variants.validate commands.</item>
  <item>Fixed stale-variant bug: replaced existence-based skip with sourceHash invalidation matching video.variants.generate contract.</item>
</CHANGE_SUMMARY>
*/

import { join, relative, basename, extname } from "node:path";
import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { collectFiles } from "@warpgogol/share/fs";
import { byteHash } from "@warpgogol/fingerprint";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import type { ImageVariantEntry, ImageVariantManifest } from "@warpgogol/share/image-provider";

const MANIFEST_RELATIVE = "src/image-variants.generated.yaml";
const VARIANTS_PUBLIC_DIR = "_img";
/** Target widths for the responsive ladder (never upscale). */
const TARGET_WIDTHS = [320, 480, 640, 768, 1024, 1280] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectContentImages(contentDir: string): Promise<string[]> {
  return collectFiles(contentDir, { extensions: [".webp"] });
}

/** Derive a short stable dir name from the content-relative source path. */
function pathToHash(contentRelPath: string): string {
  // e.g. "business/de/assets/katrin-hennings.webp" → first 8 chars of base name
  // We use a simple sanitize: strip extension, replace non-alnum with dash, truncate.
  return basename(contentRelPath, extname(contentRelPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32);
}

/** Extract bare basename without extension ("katrin-hennings" from "katrin-hennings.webp"). */
function bareBasename(filePath: string): string {
  return basename(filePath, extname(filePath));
}

async function hashFile(filePath: string): Promise<string> {
  return byteHash(await readFile(filePath)).slice(("sha" + "256:").length);
}

async function readPriorManifest(manifestPath: string): Promise<ImageVariantManifest | null> {
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return yamlParse(raw) as ImageVariantManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// image.variants.generate
// ---------------------------------------------------------------------------

export async function runImageVariantsGenerate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "image.variants.generate";
  const paths = requireAstroSitePaths(ctx);

  // Read PUBLIC_IMAGE_PROVIDER from the app's .env / environment.
  // The generator is a no-op when the app is not on the build-portable provider.
  const imageProvider = process.env["PUBLIC_IMAGE_PROVIDER"];
  if (imageProvider !== "build-portable") {
    return {
      data: { command, status: "pass", note: "PUBLIC_IMAGE_PROVIDER != build-portable — skipped" },
      exitCode: 0,
      summary: `${command}: skipped (not build-portable)`,
    };
  }

  const contentDir = join(paths.appDirectory, "src", "content");
  const publicImgDir = join(paths.appDirectory, "public", VARIANTS_PUBLIC_DIR);
  const manifestPath = join(paths.appDirectory, MANIFEST_RELATIVE);

  const priorManifest = await readPriorManifest(manifestPath);
  const sourceFiles = await collectContentImages(contentDir);

  if (sourceFiles.length === 0) {
    ctx.logger.info(`${command}: no WebP content images found — manifest written empty`);
    const emptyManifest: ImageVariantManifest = {
      version: 1,
      byOrigin: {},
      byBasename: {},
    };
    await writeFile(manifestPath, yamlStringify(emptyManifest) + "\n", "utf-8");
    return {
      data: { command, status: "pass", generated: 0 },
      exitCode: 0,
      summary: `${command}: OK (0 images)`,
    };
  }

  // Lazy-load sharp — it is a devDependency of site-kernel-checks.
  const sharp = (await import("sharp")).default;

  const manifest: ImageVariantManifest = {
    version: 1,
    byOrigin: {},
    byBasename: {},
  };
  let generatedCount = 0;
  let reusedCount = 0;

  for (const srcFile of sourceFiles) {
    // Stable origin key: content-relative path, e.g. /src/content/business-profile/de/assets/name.webp
    const contentRelPath = relative(paths.appDirectory, srcFile).replace(/\\/g, "/");
    const originKey = `/${contentRelPath}`;

    // Dir name under public/_img/ derived from bare basename (human-readable, stable).
    const dirName = pathToHash(contentRelPath);
    const variantDir = join(publicImgDir, dirName);

    let metadata: { width?: number; height?: number };
    try {
      metadata = await sharp(srcFile).metadata();
    } catch (err) {
      ctx.logger.warn(
        `${command}: could not read metadata for ${relative(paths.appDirectory, srcFile)} — skipped (${String(err)})`,
      );
      continue;
    }

    const intrinsicWidth = metadata.width;
    const intrinsicHeight = metadata.height;
    const widths: number[] = TARGET_WIDTHS.filter((w) => !intrinsicWidth || w <= intrinsicWidth);

    // Source-hash invalidation (same contract as video.variants.generate RFC-0210).
    const currentHash = await hashFile(srcFile);
    const priorEntry = priorManifest?.byOrigin[originKey];
    const hashesMatch = priorEntry?.sourceHash === currentHash;

    // Fast-path: if hash matches and every expected variant file exists, reuse.
    let reuse = false;
    if (hashesMatch) {
      const allExist = await Promise.all(
        widths.map(async (w) => {
          try {
            await stat(join(variantDir, `${w}.webp`));
            return true;
          } catch {
            return false;
          }
        }),
      );
      reuse = allExist.every(Boolean);
    }

    const variants: ImageVariantEntry["variants"] = [];

    if (!reuse) {
      // Purge stale derived artifacts so we never serve old variants.
      try {
        await rm(variantDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      await mkdir(variantDir, { recursive: true });

      for (const w of widths) {
        const destFile = join(variantDir, `${w}.webp`);
        await sharp(srcFile).resize(w).webp({ quality: 80 }).toFile(destFile);
        generatedCount++;
        const publicUrl = `/${VARIANTS_PUBLIC_DIR}/${dirName}/${w}.webp`;
        variants.push({ width: w, url: publicUrl });
      }
    } else {
      reusedCount++;
      for (const w of widths) {
        const publicUrl = `/${VARIANTS_PUBLIC_DIR}/${dirName}/${w}.webp`;
        variants.push({ width: w, url: publicUrl });
      }
    }

    variants.sort((a, b) => a.width - b.width);

    manifest.byOrigin[originKey] = {
      origin: originKey,
      intrinsicWidth,
      intrinsicHeight,
      variants,
      sourceHash: currentHash,
    };
    // Secondary lookup by bare basename for Astro-hashed URL resolution.
    manifest.byBasename[bareBasename(srcFile)] = originKey;
  }

  const manifestContent = yamlStringify(manifest) + "\n";
  await writeFile(manifestPath, manifestContent, "utf-8");

  ctx.logger.info(
    `${command}: processed ${sourceFiles.length} source image(s), generated ${generatedCount} variant file(s), reused ${reusedCount} source(s)`,
  );

  return {
    data: {
      command,
      status: "pass",
      sources: sourceFiles.length,
      generated: generatedCount,
      reused: reusedCount,
    },
    exitCode: 0,
    summary: `${command}: OK (${sourceFiles.length} sources, ${generatedCount} new, ${reusedCount} reused)`,
  };
}

// ---------------------------------------------------------------------------
// image.variants.validate
// ---------------------------------------------------------------------------

export async function runImageVariantsValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "image.variants.validate";
  const paths = requireAstroSitePaths(ctx);
  const manifestPath = join(paths.appDirectory, MANIFEST_RELATIVE);

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch {
    // No manifest = app is not using build-portable provider. Skip silently.
    return {
      data: {
        command,
        status: "pass",
        note: "no manifest found — build-portable provider not active",
        checkedVariants: 0,
      },
      exitCode: 0,
      summary: `${command}: skipped (no manifest)`,
    };
  }

  let manifest: ImageVariantManifest;
  try {
    // Parse manifest directly (field-based marker, no // comment to strip).
    manifest = yamlParse(raw) as ImageVariantManifest;
  } catch {
    return {
      data: {
        command,
        status: "fail",
        violations: [`${MANIFEST_RELATIVE} is not valid YAML`],
      },
      exitCode: 1,
      summary: `${command}: invalid manifest YAML`,
    };
  }

  const violations: string[] = [];
  let checkedVariants = 0;

  for (const entry of Object.values(manifest.byOrigin)) {
    for (const variant of entry.variants) {
      checkedVariants++;
      // variant.url is e.g. /_img/<hash>/<width>.webp → map to public/_img/…
      const relUrl = variant.url.replace(/^\//, "");
      const diskPath = join(paths.appDirectory, "public", relUrl);
      try {
        await stat(diskPath);
      } catch {
        violations.push(`Missing variant file: public/${relUrl} (origin: ${entry.origin})`);
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      ctx.logger.error(`${command}: ${v}`);
    }
    return {
      data: { command, status: "fail", violations, checkedVariants },
      exitCode: 1,
      summary: `${command}: ${violations.length} missing variant(s)`,
    };
  }

  return {
    data: { command, status: "pass", violations: [], checkedVariants },
    exitCode: 0,
    summary: `${command}: OK (${checkedVariants} variants across ${Object.keys(manifest.byOrigin).length} images)`,
  };
}
