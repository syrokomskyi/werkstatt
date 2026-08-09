/*
<MODULE_CONTRACT>
<purpose>
Validates RFC-0099 page-driven shared context contracts for app page blocks.
Ensures required fallback pages exist and that fallback lookup for block ids is
resolvable and non-ambiguous at author time.
</purpose>
<non-goals>
  <item>Do not validate per-section propsSchema correctness — page.block.validate owns that.</item>
  <item>Do not render pages or call buildPage().</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { PageEntrySchema, systemManifestSchema } from "@warpgogol/ontology";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  collectMarkdownFiles,
  loadSystemManifest,
  parseMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { collectSharedContextCandidatesByLevel } from "@warpgogol/share/shared-context";
import { resultFromViolations } from "./result-helpers.ts";

interface ParsedPage {
  rel: string;
  pageId: string;
  entry: {
    blocks: Array<{
      id?: string;
      type?: string;
      use?: string;
      props?: Record<string, unknown>;
    }>;
  };
}

function hasOwnProps(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.keys(value as object).length > 0;
}

export async function runSharedContextValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  try {
    const paths = requireAstroSitePaths(context);
    const contentDir = join(paths.appDirectory, "src", "content");
    const pagesDir = join(contentDir, "pages");
    const violations: string[] = [];

    const systemResult = await loadSystemManifest(contentDir);
    const system = systemManifestSchema.parse(systemResult.manifest);
    const configuredPageIds = new Set((system.pages ?? []).map((page) => page.pageId));
    const requiredPageIds = system.sharedContext?.requiredPageIds ?? [];

    for (const pageId of requiredPageIds) {
      if (!configuredPageIds.has(pageId)) {
        violations.push(
          `src/content/system.md: sharedContext.requiredPageIds contains \"${pageId}\" but pages[] has no matching pageId`,
        );
      }
    }

    const markdownFiles = await collectMarkdownFiles(pagesDir);
    const parsedPages = new Map<string, ParsedPage>();

    for (const filePath of markdownFiles) {
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      const rawContent = await readFile(filePath, "utf8");
      const { data: frontmatter } = parseMarkdownFrontmatter(rawContent);
      const parsed = PageEntrySchema.safeParse(frontmatter);
      if (!parsed.success) continue;

      const pageId =
        typeof (frontmatter as Record<string, unknown>).pageId === "string"
          ? ((frontmatter as Record<string, unknown>).pageId as string)
          : undefined;
      if (!pageId) continue;

      parsedPages.set(pageId, {
        rel,
        pageId,
        entry: parsed.data,
      });
    }

    for (const pageId of requiredPageIds) {
      if (!parsedPages.has(pageId)) {
        violations.push(
          `src/content/system.md: sharedContext.requiredPageIds requires pageId \"${pageId}\" but no matching page content entry was found`,
        );
      }
    }

    const pagesMap = new Map(
      [...parsedPages.entries()].map(([pageId, page]) => [
        pageId,
        { pageId, blocks: page.entry.blocks },
      ]),
    );

    for (const [, page] of parsedPages) {
      for (let i = 0; i < page.entry.blocks.length; i++) {
        const block = page.entry.blocks[i];
        if (!block.id || hasOwnProps(block.props)) {
          continue;
        }

        const candidates = collectSharedContextCandidatesByLevel({
          currentPageId: page.pageId,
          block,
          pages: pagesMap,
          requiredPageIds,
        });

        const sameLevelAmbiguity = [
          ["home", candidates.home],
          ["required", candidates.required],
          ["other", candidates.other],
        ].find(([, value]) => value.length > 1) as [string, Array<{ pageId: string }>] | undefined;

        const blockPath = `${page.rel}: blocks[${i}] (id=${block.id}, type=${block.type ?? block.use})`;

        if (sameLevelAmbiguity) {
          const [level, entries] = sameLevelAmbiguity;
          violations.push(
            `${blockPath}: shared context is ambiguous in ${level} priority level — matching pages: ${entries.map((entry) => entry.pageId).join(", ")}`,
          );
          continue;
        }
      }
    }

    return resultFromViolations("shared.context.validate", violations);
  } catch (err) {
    return resultFromViolations("shared.context.validate", [
      `Unexpected error: ${(err as Error).message}`,
    ]);
  }
}
