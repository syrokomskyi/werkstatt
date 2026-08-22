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
  <item>RFC-0788 fix: Add diagnostic log when no markdown twins found in public/ — helps operators distinguish "no twins generated yet" from "directory missing".</item>
  <item>RFC-0912: emit sitemap-video.xml from opted-in content video blocks + variant manifest; always written (even when empty); added to sitemap index.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import {
  markdownTwinRelPath,
  markdownTwinUrlPath,
} from "@warpgogol/werkstatt-shared/share/semantic";
import type { VideoManifest } from "@warpgogol/werkstatt-shared/share/schemas/media";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { passResult, failResult } from "./result-helpers.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import {
  IMAGE_SITEMAP_FILENAME,
  VIDEO_SITEMAP_FILENAME,
  VideoSitemapEntry,
  buildClustersFromSystemMd,
  groupClustersByCategory,
  generateSitemapIndex,
  generateSitemapXml,
  generateVideoSitemapXml,
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

/** RFC-0912: scan page frontmatter for blocks with seo.videoObject opt-in and collect video sitemap entries. */
async function collectVideoSitemapEntries(
  io: KernelRuntimeContext["io"],
  appDir: string,
  siteUrl: string,
  clusters: Array<{ pageId: string; locales: Array<{ lang: string; path: string; url: string }> }>,
  defaultLanguage: string,
): Promise<VideoSitemapEntry[]> {
  // Read the variant manifest produced by video.variants.generate.
  const manifestPath = join(appDir, "src", "video-manifest.generated.yaml");
  let manifest: VideoManifest | null = null;
  try {
    const raw = await io.readFile(manifestPath);
    manifest = yamlParse(raw) as VideoManifest;
  } catch {
    // No manifest — no opted-in videos to emit.
    return [];
  }
  if (!manifest || !manifest.byToken || !manifest.byOrigin) return [];

  // Build (pageId, lang) → url lookup from clusters.
  const urlByPageIdLang = new Map<string, string>();
  for (const cluster of clusters) {
    for (const locale of cluster.locales) {
      urlByPageIdLang.set(`${cluster.pageId}|${locale.lang}`, locale.url);
    }
  }

  const pagesDir = join(appDir, "src", "content", "pages");
  let files: string[];
  try {
    files = await collectFiles(pagesDir, {
      extensions: [".md"],
      ignore: (name) => name === "AGENTS.md",
    });
  } catch {
    return [];
  }

  const entries: VideoSitemapEntry[] = [];
  for (const file of files) {
    let raw: string;
    try {
      raw = await io.readFile(file);
    } catch {
      continue;
    }
    const { data: fm } = parseMarkdownFrontmatter(raw);
    if (!fm || typeof fm !== "object") continue;

    const pageId = fm["pageId"] as string | undefined;
    if (!pageId) continue;

    // Derive lang from file path: src/content/pages/<lang>/...
    const rel = relative(pagesDir, file).replace(/\\/g, "/");
    const lang = rel.split("/")[0] ?? defaultLanguage;

    const pageUrl = urlByPageIdLang.get(`${pageId}|${lang}`);
    if (!pageUrl) continue;

    // Walk blocks to find opted-in video blocks.
    const blocks = (fm["blocks"] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const block of blocks) {
      const props = (block["props"] ?? block) as Record<string, unknown>;
      const seo = props["seo"];
      if (!seo || typeof seo !== "object") continue;
      const seoRecord = seo as Record<string, unknown>;
      if (seoRecord["videoObject"] !== true) continue;

      const name = seoRecord["name"];
      const description = seoRecord["description"];
      const uploadDate = seoRecord["uploadDate"];
      if (
        typeof name !== "string" ||
        typeof description !== "string" ||
        typeof uploadDate !== "string"
      ) {
        continue;
      }

      // Find the media token for this block.
      const media = props["media"];
      if (!media || typeof media !== "object") continue;
      const mediaRecord = media as Record<string, unknown>;
      const source = mediaRecord["source"];
      if (!source || typeof source !== "object") continue;
      const sourceRecord = source as Record<string, unknown>;
      const token = sourceRecord["name"];
      if (typeof token !== "string") continue;

      const cleanToken = token.replace(/\.(mp4|webm)$/i, "");
      const originKey =
        manifest.byToken[`${lang}/${cleanToken}`] ??
        (lang !== defaultLanguage
          ? manifest.byToken[`${defaultLanguage}/${cleanToken}`]
          : undefined);
      if (!originKey) continue;

      const entry = manifest.byOrigin[originKey];
      if (!entry) continue;

      const baseUrl = siteUrl.replace(/\/$/, "");
      const poster = entry.poster;
      if (!poster) continue;
      const thumbnailLoc = poster.startsWith("http") ? poster : `${baseUrl}${poster}`;
      const mp4 = entry.sources.mp4;
      if (!mp4) continue;
      const contentLoc = mp4.startsWith("http") ? mp4 : `${baseUrl}${mp4}`;

      entries.push({
        pageUrl,
        thumbnailLoc,
        title: name,
        description,
        contentLoc,
        duration: entry.durationSec,
        publicationDate: uploadDate,
      });
    }
  }

  return entries;
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
  // RFC-0912: always emit sitemap-video.xml (even when empty) and add it to the index.
  const videoEntries = await collectVideoSitemapEntries(
    context.io,
    paths.appDirectory,
    siteUrl,
    clusters,
    defaultLanguage,
  );
  const videoSitemapXml = generateVideoSitemapXml(videoEntries);
  const videoSitemapPath = join(paths.publicDirectory, VIDEO_SITEMAP_FILENAME);
  await writeGeneratedFile(context.io, videoSitemapPath, videoSitemapXml);
  writtenFiles.push(videoSitemapPath);

  const indexNames = [...subSitemapNames, IMAGE_SITEMAP_FILENAME, VIDEO_SITEMAP_FILENAME];

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
      videoCount: videoEntries.length,
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
  // RFC-0912: the video sitemap is video-shaped — validated by video.structured-data.validate, not here.
  const subSitemapNames = parseSitemapIndex(indexXml, siteUrl).filter(
    (name) => name !== IMAGE_SITEMAP_FILENAME && name !== VIDEO_SITEMAP_FILENAME,
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
