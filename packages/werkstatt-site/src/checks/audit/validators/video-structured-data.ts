/*
<MODULE_CONTRACT>
<purpose>RFC-0912 video structured data validator: checks that every opted-in content video block renders a complete VideoObject JSON-LD node, that no non-opted-in video carries VideoObject markup, and that sitemap-video.xml entries match opted-in videos.</purpose>
<non-goals>
  <item>Do not validate encoding variants — that is video.variants.validate (RFC-0210).</item>
  <item>Do not validate Google's full video-sitemap schema — only our own contract.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0912: created video.structured-data.validate with rules VIDEO-SEO-01 through VIDEO-SEO-05.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type { VideoManifest } from "@warpgogol/werkstatt-shared/share/schemas/media";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import {
  collectRenderedHtml,
  extractAllJsonLdNodes,
  finding,
  jsonLdNodeHasType,
  getRoutePathForHtml,
} from "./helpers.ts";

interface OptedInVideo {
  pageId: string;
  lang: string;
  file: string;
  blockId?: string;
  name: string;
  description: string;
  uploadDate: string;
  token: string;
}

/** Walk page frontmatter blocks collecting opted-in video blocks. */
function collectOptedInVideos(
  fm: Record<string, unknown>,
  file: string,
  pagesDir: string,
): OptedInVideo[] {
  const pageId = fm["pageId"] as string | undefined;
  if (!pageId) return [];

  const rel = relative(pagesDir, file).replace(/\\/g, "/");
  const lang = rel.split("/")[0] ?? "";

  const blocks = (fm["blocks"] as Array<Record<string, unknown>> | undefined) ?? [];
  const result: OptedInVideo[] = [];

  for (const block of blocks) {
    const props = (block["props"] ?? block) as Record<string, unknown>;
    const seo = props["seo"];
    if (!seo || typeof seo !== "object") continue;
    const seoRecord = seo as Record<string, unknown>;
    if (seoRecord["videoObject"] !== true) continue;

    const name = seoRecord["name"];
    const description = seoRecord["description"];
    const uploadDate = seoRecord["uploadDate"];
    const blockId = block["id"] as string | undefined;

    const media = props["media"];
    if (!media || typeof media !== "object") continue;
    const mediaRecord = media as Record<string, unknown>;
    const source = mediaRecord["source"];
    if (!source || typeof source !== "object") continue;
    const sourceRecord = source as Record<string, unknown>;
    const token = sourceRecord["name"];
    if (typeof token !== "string") continue;

    result.push({
      pageId,
      lang,
      file,
      blockId,
      name: typeof name === "string" ? name : "",
      description: typeof description === "string" ? description : "",
      uploadDate: typeof uploadDate === "string" ? uploadDate : "",
      token: token.replace(/\.(mp4|webm)$/i, ""),
    });
  }

  return result;
}

/** Parse sitemap-video.xml and extract content_loc URLs. */
function parseVideoSitemapEntries(xml: string): string[] {
  const entries: string[] = [];
  const re = /<video:content_loc>([^<]+)<\/video:content_loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    entries.push(match[1].trim());
  }
  return entries;
}

export async function runVideoStructuredDataValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];

  const pagesDir = join(audit.contentDirectory, "pages");
  const manifestPath = join(audit.appDirectory, "src", "video-manifest.generated.yaml");

  // Read variant manifest.
  let manifest: VideoManifest | null = null;
  try {
    const raw = await readFile(manifestPath, "utf-8");
    manifest = yamlParse(raw) as VideoManifest;
  } catch {
    // No manifest — no opted-in videos possible.
  }

  // Collect opted-in videos from page frontmatter.
  let pageFiles: string[] = [];
  try {
    pageFiles = await collectFiles(pagesDir, {
      extensions: [".md"],
      ignore: (name) => name === "AGENTS.md",
    });
  } catch {
    // No pages directory — nothing to validate.
  }

  const optedInVideos: OptedInVideo[] = [];
  for (const file of pageFiles) {
    let raw: string;
    try {
      raw = await readFile(file, "utf-8");
    } catch {
      continue;
    }
    const { data: fm } = parseMarkdownFrontmatter(raw);
    if (!fm || typeof fm !== "object") continue;
    optedInVideos.push(...collectOptedInVideos(fm as Record<string, unknown>, file, pagesDir));
  }

  // VIDEO-SEO-01: Opted-in block missing a required VideoObject field.
  for (const video of optedInVideos) {
    if (!video.name || !video.description || !video.uploadDate) {
      const missing: string[] = [];
      if (!video.name) missing.push("name");
      if (!video.description) missing.push("description");
      if (!video.uploadDate) missing.push("uploadDate");
      findings.push(
        finding({
          ruleId: "VIDEO-SEO-01",
          severity: "error",
          file: video.file,
          message: `Opted-in video block (pageId: ${video.pageId}, lang: ${video.lang}) is missing required VideoObject field(s): ${missing.join(", ")}.`,
          evidence: [{ kind: "source", file: video.file, snippet: `seo.videoObject: true` }],
        }),
      );
    }
  }

  // Collect rendered HTML and extract VideoObject nodes.
  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  const videoObjectNodes: Array<{
    file: string;
    routePath: string;
    node: Record<string, unknown>;
  }> = [];
  for (const html of htmlFiles) {
    const nodes = extractAllJsonLdNodes(html.html);
    const routePath = getRoutePathForHtml(audit.distDirectory, html.file, html.html);
    for (const node of nodes) {
      if (jsonLdNodeHasType(node, "VideoObject")) {
        videoObjectNodes.push({ file: html.file, routePath, node });
      }
    }
  }

  // Build a set of contentUrls from manifest for opted-in videos.
  const optedInContentUrls = new Set<string>();
  if (manifest) {
    for (const video of optedInVideos) {
      const originKey =
        manifest.byToken[`${video.lang}/${video.token}`] ?? undefined;
      if (!originKey) continue;
      const entry = manifest.byOrigin[originKey];
      if (entry?.sources?.mp4) {
        optedInContentUrls.add(entry.sources.mp4);
      }
    }
  }

  // VIDEO-SEO-02: Opted-in video has no corresponding VideoObject node in rendered HTML.
  for (const video of optedInVideos) {
    if (!video.name || !video.description || !video.uploadDate) continue;
    const hasMatchingNode = videoObjectNodes.some((item) => {
      const nodeName = item.node["name"];
      const nodeUploadDate = item.node["uploadDate"];
      return (
        typeof nodeName === "string" &&
        nodeName === video.name &&
        typeof nodeUploadDate === "string" &&
        nodeUploadDate === video.uploadDate
      );
    });
    if (!hasMatchingNode) {
      findings.push(
        finding({
          ruleId: "VIDEO-SEO-02",
          severity: "error",
          file: video.file,
          message: `Opted-in video (pageId: ${video.pageId}, lang: ${video.lang}, token: ${video.token}) has no corresponding VideoObject JSON-LD node in rendered HTML.`,
          evidence: [{ kind: "source", file: video.file, snippet: `seo.videoObject: true` }],
        }),
      );
    }
  }

  // VIDEO-SEO-03: Rendered VideoObject traces to a non-opted-in or hero/background block.
  const optedInNames = new Set(optedInVideos.map((v) => v.name).filter((n) => n.length > 0));
  for (const item of videoObjectNodes) {
    const nodeName = item.node["name"];
    if (typeof nodeName === "string" && nodeName.length > 0 && !optedInNames.has(nodeName)) {
      findings.push(
        finding({
          ruleId: "VIDEO-SEO-03",
          severity: "error",
          file: item.file,
          message: `Rendered VideoObject (name: "${nodeName}") does not trace to an opted-in content video block — possible decorative-video markup.`,
          evidence: [{ kind: "rendered", file: item.file, snippet: JSON.stringify(item.node) }],
        }),
      );
    }
  }

  // VIDEO-SEO-04: sitemap-video.xml entry missing for opted-in video, or entry for non-opted-in.
  let sitemapVideoXml = "";
  try {
    sitemapVideoXml = await readFile(
      join(audit.publicDirectory, "sitemap-video.xml"),
      "utf-8",
    );
  } catch {
    // sitemap-video.xml not generated yet — skip VIDEO-SEO-04.
  }

  if (sitemapVideoXml) {
    const sitemapEntries = parseVideoSitemapEntries(sitemapVideoXml);

    // Check every opted-in video has a sitemap entry (by contentUrl).
    if (manifest) {
      for (const video of optedInVideos) {
        if (!video.name || !video.description || !video.uploadDate) continue;
        const originKey = manifest.byToken[`${video.lang}/${video.token}`];
        if (!originKey) continue;
        const entry = manifest.byOrigin[originKey];
        const mp4 = entry?.sources?.mp4;
        if (!mp4) continue;
        const fullUrl = mp4.startsWith("http") ? mp4 : mp4;
        if (!sitemapEntries.includes(fullUrl)) {
          findings.push(
            finding({
              ruleId: "VIDEO-SEO-04",
              severity: "error",
              file: video.file,
              message: `Opted-in video (pageId: ${video.pageId}, lang: ${video.lang}) has no sitemap-video.xml entry (content_loc: ${mp4}).`,
              evidence: [{ kind: "source", file: video.file, snippet: `seo.videoObject: true` }],
            }),
          );
        }
      }
    }

    // Check no sitemap entries exist for non-opted-in videos.
    const optedInMp4Urls = new Set<string>();
    if (manifest) {
      for (const video of optedInVideos) {
        const originKey = manifest.byToken[`${video.lang}/${video.token}`];
        if (!originKey) continue;
        const entry = manifest.byOrigin[originKey];
        if (entry?.sources?.mp4) optedInMp4Urls.add(entry.sources.mp4);
      }
    }
    for (const entryUrl of sitemapEntries) {
      if (!optedInMp4Urls.has(entryUrl)) {
        findings.push(
          finding({
            ruleId: "VIDEO-SEO-04",
            severity: "error",
            file: join(audit.publicDirectory, "sitemap-video.xml"),
            message: `sitemap-video.xml entry (content_loc: ${entryUrl}) does not correspond to an opted-in content video.`,
            evidence: [{ kind: "rendered", file: join(audit.publicDirectory, "sitemap-video.xml"), snippet: entryUrl }],
          }),
        );
      }
    }
  }

  // VIDEO-SEO-05: VideoObject duration absent (warning).
  for (const item of videoObjectNodes) {
    const duration = item.node["duration"];
    if (duration === undefined || duration === null || duration === "") {
      const nodeName = item.node["name"];
      findings.push(
        finding({
          ruleId: "VIDEO-SEO-05",
          severity: "warning",
          file: item.file,
          message: `VideoObject (name: "${nodeName}") has no duration field — variant manifest may lack durationSec, degrading rich-result eligibility.`,
          evidence: [{ kind: "rendered", file: item.file, snippet: JSON.stringify(item.node) }],
        }),
      );
    }
  }

  const result = buildAuditResult({
    command: "video.structured-data.validate",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `video.structured-data.validate: ${result.status}`,
  };
}
