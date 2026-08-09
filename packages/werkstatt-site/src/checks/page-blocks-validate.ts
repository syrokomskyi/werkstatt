/*
<MODULE_CONTRACT>
<purpose>RFC-0372: validate that every block type in an app has a registered extractor and every block has an id. Prevents silent markdown twin degradation and enforces the unified SemanticBlock contract.</purpose>
<non-goals>
  <item>Do not validate runtime rendering — only static block declarations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0208: introduced page.blocks.validate for extractor coverage auditing.</item>
  <item>RFC-0372: renamed to page.blocks.extract.validate; strengthened to require all block types to have registered extractors (not just text-bearing ones); require all blocks to have id fields; reads from unified page.blocks.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  collectMarkdownFiles,
  loadSemanticSiteModel,
  loadSystemManifest,
  parseMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { BLOCK_EXTRACTORS } from "@warpgogol/werkstatt-site/share/semantic";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { failResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

export async function runPageBlocksValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const contentDir = join(paths.appDirectory, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const languages = manifest.i18n?.supported
    ? Object.keys(manifest.i18n.supported)
    : [defaultLanguageFromManifest(manifest)];

  const violations: string[] = [];
  const unhandledTypes = new Set<string>();
  const missingIds: string[] = [];
  const pageReports: Array<{
    pageId: string;
    lang: string;
    title: string;
    blocks: Array<{ blockId: string; blockType: string; status: string; extractedBytes: number }>;
  }> = [];

  for (const lang of languages) {
    const semanticSite = await loadSemanticSiteModel({ contentDir, lang, siteUrl });
    for (const page of semanticSite.pages) {
      const reportBlocks: Array<{
        blockId: string;
        blockType: string;
        status: string;
        extractedBytes: number;
      }> = [];

      for (const block of page.blocks) {
        const bytes = JSON.stringify(block).length;
        reportBlocks.push({
          blockId: block.id,
          blockType: block.blockType ?? "prose",
          status: "extracted",
          extractedBytes: bytes,
        });
      }

      if (reportBlocks.length > 0) {
        pageReports.push({
          pageId: page.title,
          lang,
          title: page.title,
          blocks: reportBlocks,
        });
      }
    }
  }

  // RFC-0372: deep frontmatter scan — read raw page files and check:
  // 1. Every block type has a registered extractor (not just text-bearing ones).
  // 2. Every block has an id field.
  for (const lang of languages) {
    const pagesDir = join(contentDir, "pages", lang);
    const pageFiles = await collectMarkdownFiles(pagesDir);
    for (const file of pageFiles) {
      const text = await readFile(file, "utf-8");
      const parsed = parseMarkdownFrontmatter(text);
      const blocks = (parsed.data["blocks"] as Array<Record<string, unknown>> | undefined) ?? [];
      const relativeFile = file.replace(contentDir + "\\", "").replace(contentDir + "/", "");
      for (const block of blocks) {
        const blockType = String(block["type"] ?? "");
        if (!blockType) continue;
        // RFC-0372: all block types must have registered extractors — no exceptions.
        if (!BLOCK_EXTRACTORS.has(blockType)) {
          unhandledTypes.add(blockType);
        }
        // RFC-0372: every block must have an id field.
        const blockId = block["id"];
        if (!blockId || typeof blockId !== "string" || blockId.length === 0) {
          missingIds.push(`${relativeFile}: block type "${blockType}" missing id`);
        }
      }
    }
  }

  // Coverage check: list all extractors and ensure key types are present
  const registered = new Set(BLOCK_EXTRACTORS.listTypes());
  const requiredTypes = [
    "hero-decision-card",
    "audience-cards",
    "comparison-cards",
    "price-card",
    "ownership-block",
    "controlled-responsibility-block",
    "notausgang-block",
    "faq-list",
    "final-cta",
    "trust-strip",
    "send-message",
    "chat-widget",
    "markdown",
    "hero",
    "problem",
    "approach",
    "impact",
    "social-proof",
    "donation-use",
    "women",
    "transparency",
    "people",
    "video-section",
    "donation-card",
    "credits",
    "passport-header",
    "pulsar",
    "passport-score-grid",
    "passport-provenance",
    "passport-star-map",
  ];
  const missing = requiredTypes.filter((t) => !registered.has(t));
  for (const m of missing) unhandledTypes.add(m);

  if (unhandledTypes.size > 0) {
    const types = Array.from(unhandledTypes).join(", ");
    violations.push(`Unhandled block types (no registered extractor): ${types}`);
  }

  if (missingIds.length > 0) {
    violations.push(`Blocks missing id field:\n  ${missingIds.join("\n  ")}`);
  }

  if (violations.length > 0) {
    return failResult("page.blocks.extract.validate", violations);
  }

  return {
    data: {
      command: "page.blocks.extract.validate",
      status: "pass",
      summary: {
        registeredExtractors: Array.from(registered),
        pagesWithBlocks: pageReports.length,
      },
    },
    exitCode: 0,
    summary: `page.blocks.extract.validate: ${Array.from(registered).length} extractor(s) registered, ${pageReports.length} page(s) with blocks`,
  };
}
