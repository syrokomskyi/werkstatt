/*
<MODULE_CONTRACT>
<purpose>
  RFC-0049 sitemap generation and validation commands.
  sitemap.generate writes public/sitemap.xml (sitemap index) and
  public/sitemap-<category>.xml (sub-sitemaps) from the route registry.
  sitemap.validate reads the index, parses sub-sitemaps, and checks structural
  correctness and bidirectional hreflang symmetry against the route registry.
</purpose>
<non-goals>
  <item>Do not crawl HTML to discover URLs.</item>
  <item>Do not manage Astro build output or server state.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0049: Initial implementation.</item>
  <item>RFC-0049 enhancement: Multi-file sitemap with category split (content/legal), sitemap index, and lastmod support.</item>
  <item>RFC-0081: Use GENERATED marker protocol for sitemap files.</item>
  <item>RFC-0049/0160: emit an x-default hreflang alternate (default-language URL) per cluster, shared by generator and validator via clusterAlternates.</item>
  <item>Removed lastmod from generated sitemap index and sub-sitemaps to avoid daily no-op commits.</item>
  <item>RFC-0267: routed all filesystem access through context.io (WorkspaceIO port) — sitemap.generate gains universal --dry-run and drops its hand-rolled dryRun guard; the module no longer imports node:fs (readdir now returns port-neutral DirEntry[]).</item>
  <item>RFC-0788: Build markdownTwins map from public/*.md files and pass to generateSitemapXml/validateSitemapFile for markdown alternate link support.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { markdownTwinRelPath, markdownTwinUrlPath } from "@warpgogol/werkstatt-site/share/semantic";
import { passResult, failResult } from "./result-helpers.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import {
  IMAGE_SITEMAP_FILENAME,
  buildClustersFromSystemMd,
  groupClustersByCategory,
  generateSitemapIndex,
  generateSitemapXml,
  writeGeneratedFile,
  parseSitemapXml,
  parseSitemapIndex,
  validateSitemapFile,
} from "./sitemap-helpers.ts";

/**
 * RFC-0788: Build a map of page URL → markdown twin URL for pages that have .md twins in public/.
 * Scans public/ for .md files, then matches them against cluster locale paths.
 */
async function buildMarkdownTwinsMap(
  publicDir: string,
  siteUrl: string,
  clusters: Array<{ locales: Array<{ lang: string; path: string; url: string }> }>,
  supportedLangs: string[],
): Promise<Map<string, string>> {
  const markdownFiles = await collectFiles(publicDir, {
    extensions: [".md"],
    ignore: () => false,
  });
  const twinRelPaths = new Set(
    markdownFiles.map((f) => relative(publicDir, f).replace(/\\/g, "/")),
  );
  const map = new Map<string, string>();
  const baseUrl = siteUrl.replace(/\/$/, "");
  for (const cluster of clusters) {
    for (const locale of cluster.locales) {
      const relPath = markdownTwinRelPath(locale.path, { supportedLangs });
      if (twinRelPaths.has(relPath)) {
        const twinUrl = `${baseUrl}${markdownTwinUrlPath(locale.path, { supportedLangs })}`;
        map.set(locale.url, twinUrl);
      }
    }
  }
  return map;
}

export async function runSitemapGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const { clusters, categoryMap, defaultLanguage, supportedLanguages } =
    await buildClustersFromSystemMd(context.io, paths.appDirectory, siteUrl);
  const grouped = groupClustersByCategory(clusters, categoryMap);

  // RFC-0788: build markdownTwins map from public/*.md files.
  const markdownTwins = await buildMarkdownTwinsMap(
    paths.publicDirectory,
    siteUrl,
    clusters,
    supportedLanguages,
  );
  if (markdownTwins.size === 0) {
    context.logger.info(
      "sitemap.generate: no markdown twins found in public/ — sitemap will not include text/markdown alternate links",
    );
  }

  const writtenFiles: string[] = [];
  const subSitemapNames: string[] = [];

  for (const [category, categoryClusters] of grouped) {
    const filename = `sitemap-${category}.xml`;
    subSitemapNames.push(filename);
    const xml = generateSitemapXml(categoryClusters, defaultLanguage, markdownTwins);
    const filePath = join(paths.publicDirectory, filename);
    await writeGeneratedFile(context.io, filePath, xml);
    writtenFiles.push(filePath);
  }

  // RFC-0172: advertise the post-build image sitemap so crawlers discover it.
  // The file itself is emitted into dist/client by sitemap.images.generate (it is
  // not written here, and sitemap.validate skips it — it is dist-only, image-only).
  const indexNames = [...subSitemapNames, IMAGE_SITEMAP_FILENAME];

  // Write sitemap index
  const indexXml = generateSitemapIndex(siteUrl, indexNames);
  const indexPath = join(paths.publicDirectory, "sitemap.xml");
  await writeGeneratedFile(context.io, indexPath, indexXml);
  writtenFiles.push(indexPath);

  const urlCount = clusters.reduce((sum, c) => sum + c.locales.length, 0);

  return {
    data: {
      command: "sitemap.generate",
      status: "pass",
      urlCount,
      files: writtenFiles,
      categories: Array.from(grouped.keys()),
      clusters: clusters.map((c) => ({
        pageId: c.pageId,
        locales: c.locales.map((l) => ({ lang: l.lang, path: l.path, url: l.url })),
      })),
    },
    exitCode: 0,
    summary: context.dryRun
      ? `sitemap.generate: dry-run — ${urlCount} URL(s) from ${clusters.length} cluster(s) across ${grouped.size} category/ies (would write ${writtenFiles.length} file(s))`
      : `sitemap.generate: ${urlCount} URL(s) from ${clusters.length} cluster(s) across ${grouped.size} category/ies → ${writtenFiles.length} file(s)`,
  };
}

// ---------------------------------------------------------------------------
// sitemap.validate
// ---------------------------------------------------------------------------

export async function runSitemapValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const { clusters, defaultLanguage, supportedLanguages } = await buildClustersFromSystemMd(
    context.io,
    paths.appDirectory,
    siteUrl,
  );

  // RFC-0788: build markdownTwins map for validation.
  const markdownTwins = await buildMarkdownTwinsMap(
    paths.publicDirectory,
    siteUrl,
    clusters,
    supportedLanguages,
  );

  const indexPath = join(paths.publicDirectory, "sitemap.xml");
  let indexXml: string;
  try {
    indexXml = await context.io.readFile(indexPath);
  } catch {
    return failResult("sitemap.validate", [
      `sitemap.xml index not found at ${indexPath}. Run sitemap.generate first.`,
    ]);
  }

  // RFC-0172: the image sitemap is dist-only and image-shaped — validated by
  // sitemap.images.validate, not here.
  const subSitemapNames = parseSitemapIndex(indexXml, siteUrl).filter(
    (name) => name !== IMAGE_SITEMAP_FILENAME,
  );
  if (subSitemapNames.length === 0) {
    return failResult("sitemap.validate", [
      `sitemap.xml index at ${indexPath} contains no sub-sitemaps.`,
    ]);
  }

  const allViolations: string[] = [];
  let totalUrls = 0;

  for (const filename of subSitemapNames) {
    const filePath = join(paths.publicDirectory, filename);
    let xml: string;
    try {
      xml = await context.io.readFile(filePath);
    } catch {
      allViolations.push(`Sub-sitemap not found: ${filePath}`);
      continue;
    }

    const parsed = parseSitemapXml(xml);
    totalUrls += parsed.length;
    allViolations.push(
      ...validateSitemapFile(parsed, clusters, filename, defaultLanguage, markdownTwins),
    );
  }

  // Check that every expected URL appears in at least one sub-sitemap
  const allParsedLocs = new Set<string>();
  for (const filename of subSitemapNames) {
    const filePath = join(paths.publicDirectory, filename);
    try {
      const xml = await context.io.readFile(filePath);
      const parsed = parseSitemapXml(xml);
      for (const entry of parsed) allParsedLocs.add(entry.loc);
    } catch {
      // already reported above
    }
  }

  const expectedUrls = new Map<string, string>(); // url -> pageId
  for (const cluster of clusters) {
    for (const locale of cluster.locales) {
      expectedUrls.set(locale.url, cluster.pageId);
    }
  }
  for (const [url, pageId] of expectedUrls) {
    if (!allParsedLocs.has(url)) {
      allViolations.push(`Missing <url> entry across all sub-sitemaps: ${url} (pageId: ${pageId})`);
    }
  }

  if (allViolations.length === 0) {
    return passResult(
      "sitemap.validate",
      `sitemap.validate: OK — ${totalUrls} URL(s) across ${subSitemapNames.length} sub-sitemap(s), ${clusters.length} cluster(s), all hreflang symmetric, markdown alternates validated`,
    );
  }

  return failResult("sitemap.validate", allViolations);
}
