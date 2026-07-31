/*
<MODULE_CONTRACT>
<purpose>
  RFC-0172 post-build image sitemap. dist.sitemap.images.generate walks the rendered
  dist/client HTML, harvests each page's single lead/content image (the render-resolved
  /_astro or /cdn-cgi/image URL marked with data-content-image, or the authored
  x-content-image head signal), and writes dist/client/sitemap-images.xml.
  dist.sitemap.images.validate re-harvests and enforces the one-image-per-page contract.
  The build is the only authority on final image URLs — this never reconstructs them.
</purpose>
<non-goals>
  <item>Do not construct /_astro or /cdn-cgi/image URLs — only read what the render emitted (RFC-0152).</item>
  <item>Do not write into public/ or any tracked path — the artifact is a dist build output.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0172: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { collectFiles } from "@warpgogol/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import {
  harvestContentImage,
  isHtmlRedirectPage,
  generateImageSitemapXml,
  type SitemapImageEntry,
} from "@warpgogol/share/semantic";
import { passResult, failResult, resultFromViolations } from "./result-helpers.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import {
  runSeoTechnicalRuntimeInstrument,
  type SeoRuntimeState,
  toDeterministicContext,
} from "@syrokomskyi/axiom-study";

const IMAGE_SITEMAP_FILENAME = "sitemap-images.xml";

/** Recursively collect rendered *.html under dist/client. */
async function collectRenderedHtml(
  distDir: string,
): Promise<Array<{ file: string; html: string }>> {
  const files = await collectFiles(distDir, { extensions: [".html"], ignore: () => false });
  return Promise.all(files.map(async (file) => ({ file, html: await readFile(file, "utf-8") })));
}

interface HarvestOutcome {
  entries: SitemapImageEntry[];
  violations: string[];
}

/**
 * Shared harvest pass used by both generate and validate. Applies the RFC-0172
 * rules and returns deterministic, deduped entries plus any violations.
 */
function harvestAll(
  htmlFiles: Array<{ file: string; html: string }>,
  siteUrl: string,
  distDir: string,
): HarvestOutcome {
  const entries: SitemapImageEntry[] = [];
  const violations: string[] = [];
  const seenLoc = new Set<string>();

  for (const { file, html } of htmlFiles) {
    if (isHtmlRedirectPage(html)) continue;
    const rel = file.replace(distDir, "").replace(/\\/g, "/");
    const { loc, imageUrls, title } = harvestContentImage(html, siteUrl);

    if (imageUrls.length === 0) continue;

    // IMGSITEMAP-01: exactly one content image per page.
    if (imageUrls.length > 1) {
      violations.push(
        `[IMGSITEMAP-01] ${rel}: ${imageUrls.length} content images marked (data-content-image / x-content-image); expected exactly one`,
      );
      continue;
    }

    const imageUrl = imageUrls[0]!;

    // IMGSITEMAP-02: a content image must carry a canonical page loc and an absolute URL.
    if (!loc) {
      violations.push(
        `[IMGSITEMAP-02] ${rel}: page has a content image but no <link rel="canonical"> to anchor it`,
      );
      continue;
    }
    if (!/^https?:\/\//i.test(imageUrl)) {
      violations.push(`[IMGSITEMAP-02] ${rel}: content image URL is not absolute: ${imageUrl}`);
      continue;
    }

    if (seenLoc.has(loc)) continue; // same canonical reached via multiple files (lang dupes)
    seenLoc.add(loc);
    entries.push({ loc, imageUrl, ...(title ? { title } : {}) });
  }

  entries.sort((a, b) => a.loc.localeCompare(b.loc));
  return { entries, violations };
}

// ---------------------------------------------------------------------------
// dist.sitemap.images.generate
// ---------------------------------------------------------------------------

export async function runSitemapImagesGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distClient = join(paths.appDirectory, "dist", "client");
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";

  const htmlFiles = await collectRenderedHtml(distClient);
  if (htmlFiles.length === 0) {
    // IMGSITEMAP-03: this is a post-build generator.
    return failResult("dist.sitemap.images.generate", [
      `[IMGSITEMAP-03] No rendered HTML under ${distClient}. Build the app before running dist.sitemap.images.generate.`,
    ]);
  }

  const { entries, violations } = harvestAll(htmlFiles, siteUrl, distClient);
  if (violations.length > 0) {
    return failResult("dist.sitemap.images.generate", violations);
  }

  const xml = generateImageSitemapXml(entries);
  const filePath = join(distClient, IMAGE_SITEMAP_FILENAME);
  if (!context.dryRun) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, xml, "utf-8");
  }

  return {
    data: {
      command: "dist.sitemap.images.generate",
      status: "pass",
      file: filePath,
      entries: entries.map((e) => ({ loc: e.loc, imageUrl: e.imageUrl, title: e.title })),
      summary: { pagesScanned: htmlFiles.length, imagesFound: entries.length },
    },
    exitCode: 0,
    summary: context.dryRun
      ? `dist.sitemap.images.generate: dry-run — ${entries.length} image(s) from ${htmlFiles.length} page(s) (would write ${IMAGE_SITEMAP_FILENAME})`
      : `dist.sitemap.images.generate: ${entries.length} image(s) from ${htmlFiles.length} page(s) → ${IMAGE_SITEMAP_FILENAME}`,
  };
}

// ---------------------------------------------------------------------------
// dist.sitemap.images.validate
// ---------------------------------------------------------------------------

export async function runSitemapImagesValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distClient = join(paths.appDirectory, "dist", "client");
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";

  const htmlFiles = await collectRenderedHtml(distClient);
  if (htmlFiles.length === 0) {
    // No dist yet — skip rather than fail, so author-phase runs don't break (RFC-0085).
    return passResult(
      "dist.sitemap.images.validate",
      "dist.sitemap.images.validate: skipped (no dist/client; post-build only)",
    );
  }

  const { entries, violations } = harvestAll(htmlFiles, siteUrl, distClient);

  // The generated artifact must exist and agree with the harvest.
  const filePath = join(distClient, IMAGE_SITEMAP_FILENAME);
  let fileXml: string | null = null;
  try {
    fileXml = await readFile(filePath, "utf-8");
  } catch {
    if (entries.length > 0) {
      violations.push(
        `[IMGSITEMAP-03] ${IMAGE_SITEMAP_FILENAME} missing but ${entries.length} content image(s) found. Run dist.sitemap.images.generate.`,
      );
    }
  }
  if (fileXml) {
    for (const e of entries) {
      if (!fileXml.includes(`<image:loc>${e.imageUrl.replace(/&/g, "&amp;")}</image:loc>`)) {
        violations.push(
          `[IMGSITEMAP-03] ${IMAGE_SITEMAP_FILENAME} is stale: missing image for ${e.loc}. Run dist.sitemap.images.generate.`,
        );
      }
    }
  }

  // RFC-0016: call axiom-study seo-runtime instrument
  let instrumentRunId: string | undefined;
  if (entries.length > 0) {
    try {
      const instrumentCtx = toDeterministicContext({
        origin: "build-time",
        recordedAt: new Date().toISOString(),
        missionId: "dist.sitemap.images.validate",
        environment: {},
      });
      const states: SeoRuntimeState[] = entries.map((entry) => ({
        url: entry.loc,
        locale: "de",
        profileId: context.site?.name ?? "site",
        logicalPath: entry.loc,
        title: entry.title ?? "untitled",
        jsonLd: [],
        ogTags: {},
        sitemapUrls: entries.map((e) => e.loc),
        renderedUrl: entry.loc,
      }));
      const instrumentResult = runSeoTechnicalRuntimeInstrument({ context: instrumentCtx, states });
      instrumentRunId = instrumentResult.instrumentRun.instrumentRunId;
    } catch {
      // Instrument failure must not break the gate
    }
  }

  const baseResult =
    violations.length === 0
      ? passResult(
          "dist.sitemap.images.validate",
          `dist.sitemap.images.validate: OK — ${entries.length} content image(s) across ${htmlFiles.length} page(s)`,
        )
      : resultFromViolations("dist.sitemap.images.validate", violations);

  if (instrumentRunId && baseResult.data) {
    (baseResult.data as unknown as Record<string, unknown>).instrumentRunId = instrumentRunId;
  }

  return baseResult;
}
