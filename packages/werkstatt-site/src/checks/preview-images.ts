/*
<MODULE_CONTRACT>
<purpose>Implements build-time Open Graph and Twitter social preview image generation and validation commands for the Site OS per RFC-0150.</purpose>
<non-goals>
  <item>Do not capture page screenshots.</item>
  <item>Do not overwrite existing files under public/ during a normal run; the ONLY exception is RFC-0235 --force-normalize, which re-renders an existing template card when its source text carries a typographic signal (baked OG text a dist sweep cannot reach).</item>
  <item>Do not handle runtime HTTP serving or dynamic worker rendering directly here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0155: backfill MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>RFC-0235: normalize OG card text before rasterization; add --force-normalize to re-render stale committed cards whose source carries a signal.</item>
  <item>RFC-0603: replace writeFile with writeFileIfChanged for idempotent binary writes — byte-identical PNGs skip disk writes.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandResult, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { pageIdToContentFileSlug } from "@warpgogol/werkstatt-site/share/content";
import { resolveNormalizeConfig, normalizeText } from "@warpgogol/werkstatt-site/share/text-normalize";
import type { NormalizeConfig } from "@warpgogol/werkstatt-site/share/text-normalize";
import { generateBrandCardPng } from "./preview-templates.ts";
import YAML from "yaml";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

export interface PreviewValidationViolation {
  rule: string;
  severity: "error" | "warning";
  file?: string;
  route?: string;
  message: string;
}

export async function runPreviewImagesValidate(
  input: unknown,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "This command must be run inside an app context.",
    };
  }

  const appDir = app.directory;
  const violations: PreviewValidationViolation[] = [];

  // 1. Ultimate fallback /og-image.png check
  const ultimateFallbackPath = join(appDir, "public", "og-image.png");
  const ultimateFallbackExists = existsSync(ultimateFallbackPath);
  const ultimateOptOutPath = join(appDir, "public", "-og-image.png");
  const ultimateOptOutExists = existsSync(ultimateOptOutPath);

  // Also check if legacy .webp exists to help warn or direct
  const legacyWebpPath = join(appDir, "public", "og-image.webp");
  if (!ultimateFallbackExists && !ultimateOptOutExists && existsSync(legacyWebpPath)) {
    violations.push({
      rule: "PREVIEW-01",
      severity: "error",
      file: "public/og-image.png",
      message:
        "Required ultimate fallback 'public/og-image.png' is missing, but 'public/og-image.webp' exists. Please convert or provide a PNG.",
    });
  } else if (!ultimateFallbackExists && !ultimateOptOutExists) {
    violations.push({
      rule: "PREVIEW-01",
      severity: "error",
      file: "public/og-image.png",
      message:
        "Required ultimate fallback 'public/og-image.png' is missing. The site cannot be built/deployed without it.",
    });
  }

  // 2. Discover routes from system.md and check their previews
  const contentDir = join(appDir, "src", "content");
  try {
    const { manifest } = await loadSystemManifest(contentDir);
    const languages = manifest.i18n?.supported
      ? Object.keys(manifest.i18n.supported)
      : [defaultLanguageFromManifest(manifest)];

    for (const page of manifest.pages) {
      const pageId = page.pageId;
      const locales = page.locales || languages;
      const fileSlug = pageIdToContentFileSlug(pageId);

      for (const lang of locales) {
        const pagePreviewRelative = `public/preview/${lang}/${fileSlug}.png`;
        const pagePreviewFullPath = join(appDir, pagePreviewRelative);
        const pagePreviewExists = existsSync(pagePreviewFullPath);

        const optOutRelative = `public/preview/${lang}/-${fileSlug}.png`;
        const optOutFullPath = join(appDir, optOutRelative);
        const optOutExists = existsSync(optOutFullPath);

        if (!pagePreviewExists && !optOutExists) {
          if (pageId === "home") {
            violations.push({
              rule: "PREVIEW-02-WARN",
              severity: "warning",
              route: `/${lang}/`,
              message: `Language-specific home preview '${pagePreviewRelative}' is missing. Page-level metadata will fallback to the ultimate '/og-image.png'.`,
            });
          }
        }
      }
    }
  } catch {
    // If system.md doesn't load we don't break the build here
  }

  if (violations.some((v) => v.severity === "error")) {
    return {
      exitCode: 1,
      summary: `Failed social preview verification: ${violations.filter((v) => v.severity === "error").length} errors found.`,
      data: { violations },
    };
  }

  return {
    exitCode: 0,
    summary: "All pages resolve deterministic preview assets successfully.",
    data: { violations },
  };
}

async function readPageFrontmatter(
  appDir: string,
  lang: string,
  fileSlug: string,
): Promise<{ title?: string; description?: string }> {
  const pagePath = join(appDir, "src", "content", "pages", lang, `${fileSlug}.md`);
  try {
    const raw = await readFile(pagePath, "utf-8");
    const parsed = parseMarkdownFrontmatter(raw);
    const data = parsed.data || {};
    return {
      title: typeof data.title === "string" ? data.title : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
    };
  } catch {
    return {};
  }
}

async function readSiteLabels(
  appDir: string,
  lang: string,
): Promise<{ brandLabel?: string; brandTagline?: string }> {
  const labelsPath = join(appDir, "src", "content", "site", lang, "labels.md");
  try {
    const raw = await readFile(labelsPath, "utf-8");
    const parsed = parseMarkdownFrontmatter(raw);
    const data = parsed.data || {};
    return {
      brandLabel: typeof data.brandLabel === "string" ? data.brandLabel : undefined,
      brandTagline: typeof data.brandTagline === "string" ? data.brandTagline : undefined,
    };
  } catch {
    return {};
  }
}

async function readBiomePalette(
  workspaceRoot: string,
  biomeId: string,
): Promise<{ surface?: string; ink?: string; brand?: string }> {
  const biomePath = join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ontology", "biomes", `${biomeId}.yaml`);
  try {
    const raw = await readFile(biomePath, "utf-8");
    const data = YAML.parse(raw) || {};
    const palette = data.palette || {};
    return {
      surface: typeof palette.surface === "string" ? palette.surface : undefined,
      ink: typeof palette.ink === "string" ? palette.ink : undefined,
      brand: typeof palette.brand === "string" ? palette.brand : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * RFC-0235: does any OG card source string carry a normalization signal? Used by
 * --force-normalize to re-render only the stale (signal-bearing) committed cards,
 * leaving clean cards untouched (no churn from sharp re-encoding).
 */
function ogSourceHasSignals(strings: Array<string | undefined>, cfg: NormalizeConfig): boolean {
  return strings.some((s) => typeof s === "string" && s.length > 0 && normalizeText(s, cfg) !== s);
}

export async function runPreviewImagesGenerate(
  input: unknown,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "This command must be run inside an app context.",
    };
  }

  // RFC-0235: --force-normalize re-renders an EXISTING template card when its source
  // text carries a signal (so pre-feature committed cards get normalized pixels).
  // Owner-custom images whose source text is already clean are never touched.
  const forceNormalize = Boolean(input?.flags?.["force-normalize"] ?? input?.flags?.forceNormalize);

  const appDir = app.directory;
  const items: unknown[] = [];
  let generatedCount = 0;
  let skippedCount = 0;
  let optOutCount = 0;

  const contentDir = join(appDir, "src", "content");
  let manifest;
  try {
    const result = await loadSystemManifest(contentDir);
    manifest = result.manifest;
  } catch (err: unknown) {
    return {
      exitCode: 1,
      summary: `Failed to load system manifest: ${err.message}`,
    };
  }

  const languages = manifest.i18n?.supported
    ? Object.keys(manifest.i18n.supported)
    : [defaultLanguageFromManifest(manifest)];
  const defaultLang = defaultLanguageFromManifest(manifest);
  const siteTagline = manifest.identity?.tagline || "";
  // RFC-0235: resolve the egress normalize config once; OG card text is normalized
  // at the source string because the post-build dist sweep cannot reach pixels.
  const normalize = resolveNormalizeConfig(manifest);
  const biomeId = manifest.identity?.biome || "";
  const palette = biomeId ? await readBiomePalette(context.workspaceRoot, biomeId) : {};

  // 1. Check/generate ultimate fallback if missing
  const ultimateFallbackRelative = "public/og-image.png";
  const ultimateFallbackFullPath = join(appDir, ultimateFallbackRelative);
  const ultimateOptOutPath = join(appDir, "public", "-og-image.png");

  if (existsSync(ultimateOptOutPath)) {
    items.push({
      pageId: "fallback",
      lang: "all",
      route: "*",
      outputPath: ultimateFallbackRelative,
      status: "skipped-optout",
      template: "ultimate-fallback",
    });
    optOutCount++;
  } else if (!existsSync(ultimateFallbackFullPath)) {
    try {
      const labels = await readSiteLabels(appDir, defaultLang);
      const png = await generateBrandCardPng({
        pageTitle: labels.brandLabel || manifest.identity?.domain || "",
        siteName: labels.brandLabel || manifest.identity?.domain || "",
        siteTagline,
        lang: defaultLang,
        brandSurface: palette.surface,
        brandInk: palette.ink,
        brandAccent: palette.brand,
        normalize,
      });
      await mkdir(join(appDir, "public"), { recursive: true });
      await writeFileIfChanged(ultimateFallbackFullPath, png);
      items.push({
        pageId: "fallback",
        lang: "all",
        route: "*",
        outputPath: ultimateFallbackRelative,
        status: "generated",
        template: "ultimate-fallback",
      });
      generatedCount++;
    } catch (err: unknown) {
      items.push({
        pageId: "fallback",
        lang: "all",
        route: "*",
        outputPath: ultimateFallbackRelative,
        status: "failed",
        template: "ultimate-fallback",
        message: err.message,
      });
    }
  } else {
    // RFC-0235: re-render the existing fallback when forced and its source has signals.
    const labels = await readSiteLabels(appDir, defaultLang);
    const fallbackSources = [
      labels.brandLabel || manifest.identity?.domain || "",
      siteTagline ? ` — ${siteTagline}` : "",
    ];
    if (forceNormalize && ogSourceHasSignals(fallbackSources, normalize)) {
      const png = await generateBrandCardPng({
        pageTitle: labels.brandLabel || manifest.identity?.domain || "",
        siteName: labels.brandLabel || manifest.identity?.domain || "",
        siteTagline,
        lang: defaultLang,
        brandSurface: palette.surface,
        brandInk: palette.ink,
        brandAccent: palette.brand,
        normalize,
      });
      await writeFileIfChanged(ultimateFallbackFullPath, png);
      items.push({
        pageId: "fallback",
        lang: "all",
        route: "*",
        outputPath: ultimateFallbackRelative,
        status: "regenerated-normalized",
        template: "ultimate-fallback",
      });
      generatedCount++;
    } else {
      items.push({
        pageId: "fallback",
        lang: "all",
        route: "*",
        outputPath: ultimateFallbackRelative,
        status: "skipped-existing",
        template: "ultimate-fallback",
      });
      skippedCount++;
    }
  }

  // 2. Page-specific preview generation under public/preview/[lang]/[fileSlug].png
  for (const page of manifest.pages) {
    const pageId = page.pageId;
    const locales = page.locales || languages;
    const fileSlug = pageIdToContentFileSlug(pageId);

    for (const lang of locales) {
      const pagePreviewRelative = `public/preview/${lang}/${fileSlug}.png`;
      const pagePreviewFullPath = join(appDir, pagePreviewRelative);
      const optOutPath = join(appDir, "public", "preview", lang, `-${fileSlug}.png`);

      if (existsSync(optOutPath)) {
        items.push({
          pageId,
          lang,
          route: `/${lang}/${pageId === "home" ? "" : fileSlug}`,
          outputPath: pagePreviewRelative,
          status: "skipped-optout",
          template: "brand-card",
        });
        optOutCount++;
        continue;
      }

      if (existsSync(pagePreviewFullPath)) {
        // RFC-0235: re-render an existing card only when forced AND its source text
        // carries a signal — otherwise leave the committed card untouched.
        let regenerated = false;
        if (forceNormalize) {
          const pageMeta = await readPageFrontmatter(appDir, lang, fileSlug);
          const labels = await readSiteLabels(appDir, lang);
          const title = pageMeta.title || labels.brandLabel || fileSlug;
          const description = pageMeta.description || siteTagline;
          const siteName = labels.brandLabel || manifest.identity?.domain || "";
          if (
            ogSourceHasSignals(
              [title, description, siteName, siteTagline ? ` — ${siteTagline}` : ""],
              normalize,
            )
          ) {
            const png = await generateBrandCardPng({
              pageTitle: title,
              pageDescription: description,
              siteName,
              siteTagline,
              lang,
              brandSurface: palette.surface,
              brandInk: palette.ink,
              brandAccent: palette.brand,
              normalize,
            });
            await writeFileIfChanged(pagePreviewFullPath, png);
            items.push({
              pageId,
              lang,
              route: `/${lang}/${pageId === "home" ? "" : fileSlug}`,
              outputPath: pagePreviewRelative,
              status: "regenerated-normalized",
              template: "brand-card",
              fileSlug,
            });
            generatedCount++;
            regenerated = true;
          }
        }
        if (!regenerated) {
          items.push({
            pageId,
            lang,
            route: `/${lang}/${pageId === "home" ? "" : fileSlug}`,
            outputPath: pagePreviewRelative,
            status: "skipped-existing",
            template: "brand-card",
          });
          skippedCount++;
        }
        continue;
      }

      // Generate the missing preview PNG
      try {
        const pageMeta = await readPageFrontmatter(appDir, lang, fileSlug);
        const labels = await readSiteLabels(appDir, lang);
        const title = pageMeta.title || labels.brandLabel || fileSlug;
        const description = pageMeta.description || siteTagline;

        const png = await generateBrandCardPng({
          pageTitle: title,
          pageDescription: description,
          siteName: labels.brandLabel || manifest.identity?.domain || "",
          siteTagline,
          lang,
          brandSurface: palette.surface,
          brandInk: palette.ink,
          brandAccent: palette.brand,
          normalize,
        });

        await mkdir(
          join(
            appDir,
            "public",
            "preview",
            lang,
            fileSlug.includes("/") ? fileSlug.slice(0, fileSlug.lastIndexOf("/")) : "",
          ),
          { recursive: true },
        );
        await writeFileIfChanged(pagePreviewFullPath, png);
        items.push({
          pageId,
          lang,
          route: `/${lang}/${pageId === "home" ? "" : fileSlug}`,
          outputPath: pagePreviewRelative,
          status: "generated",
          template: "brand-card",
          fileSlug,
        });
        generatedCount++;
      } catch (err: unknown) {
        items.push({
          pageId,
          lang,
          route: `/${lang}/${pageId === "home" ? "" : fileSlug}`,
          outputPath: pagePreviewRelative,
          status: "failed",
          template: "brand-card",
          message: err.message,
          fileSlug,
        });
      }
    }
  }

  return {
    exitCode: 0,
    summary: `Preview generation finished: generated ${generatedCount}, skipped-existing ${skippedCount}, opt-out ${optOutCount}, failed ${items.filter((i) => i.status === "failed").length}.`,
    data: {
      items,
      summary: {
        generated: generatedCount,
        skippedExisting: skippedCount,
        skippedOptout: optOutCount,
        failed: items.filter((i) => i.status === "failed").length,
      },
    },
  };
}
