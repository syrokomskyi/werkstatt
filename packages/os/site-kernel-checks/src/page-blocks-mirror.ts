/*
<MODULE_CONTRACT>
<purpose>
[RFC-0205] Implements `page.blocks.mirror.validate` — an app-scoped validator that
compares each localized page with its default-language twin block-by-block.
Catches missing nested props (labels, effects, background) caused by
`deepMergeEntryData` wholesale array replacement.
</purpose>
<non-goals>
  <item>Do not require localized twins to be identical clones; adding new keys in localized is allowed.</item>
  <item>Do not validate prop values (only presence/absence).</item>
  <item>Do not recurse into arrays inside props (cards, stats, items) — shallow prop key comparison only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0205: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { readDefaultLanguageCode } from "./lib/i18n.ts";

interface BlockMirrorViolation {
  file: string;
  defaultTwin: string;
  blockIndex: number;
  blockId?: string;
  blockType: string;
  rule: string;
  severity: "error";
  missingProp?: string;
  missingLabelKey?: string;
  message: string;
  fixHint: string;
}

interface PageBlocksMirrorResult {
  command: "page.blocks.mirror.validate";
  status: "pass" | "fail";
  pagesCompared: number;
  violations: BlockMirrorViolation[];
}

interface PageBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
}

interface ParsedPage {
  rel: string;
  lang: string;
  slug: string;
  blocks: PageBlock[];
}

async function collectPageFiles(pagesDir: string): Promise<string[]> {
  const files: string[] = [];
  // fs.walk.lint: allow — intentionally bounded to 2 levels (pages/<lang>/<file>.md),
  // not a general recursive collector; @warpgogol/share/fs collectFiles has no depth limit.
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (entry.endsWith(".md")) {
        files.push(full);
      } else {
        // Try one level deeper (e.g. pages/de/nested/file.md)
        try {
          const sub = await readdir(full);
          for (const s of sub) {
            if (s.endsWith(".md")) files.push(join(full, s));
          }
        } catch {
          // not a directory or no access
        }
      }
    }
  }
  await walk(pagesDir);
  return files;
}

function parsePage(filePath: string, relPath: string): ParsedPage | null {
  const parts = relPath.split("/");
  // Expected: src/content/pages/{lang}/{slug}.md
  const pagesIndex = parts.indexOf("pages");
  if (pagesIndex === -1 || pagesIndex + 2 >= parts.length) return null;
  const lang = parts[pagesIndex + 1];
  const slug = parts
    .slice(pagesIndex + 2)
    .join("/")
    .replace(/\.md$/, "");
  return { rel: relPath, lang, slug, blocks: [] };
}

function collectPropKeys(obj: unknown): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.keys(obj as Record<string, unknown>);
}

function compareBlocks(
  defaultBlocks: PageBlock[],
  localizedBlocks: PageBlock[],
  localizedRel: string,
  defaultRel: string,
): BlockMirrorViolation[] {
  const violations: BlockMirrorViolation[] = [];

  for (let i = 0; i < defaultBlocks.length; i++) {
    const defaultBlock = defaultBlocks[i];
    const localizedBlock = localizedBlocks[i];

    if (!localizedBlock) {
      violations.push({
        file: localizedRel,
        defaultTwin: defaultRel,
        blockIndex: i,
        blockId: defaultBlock.id,
        blockType: defaultBlock.type,
        rule: "MIRROR-01",
        severity: "error",
        message: `Localized page is missing block[${i}] (type="${defaultBlock.type}", id="${defaultBlock.id ?? ""}") that exists in default-language twin`,
        fixHint: `Add a block with type="${defaultBlock.type}" at index ${i} in the localized page`,
      });
      continue;
    }

    if (localizedBlock.type !== defaultBlock.type) {
      violations.push({
        file: localizedRel,
        defaultTwin: defaultRel,
        blockIndex: i,
        blockId: defaultBlock.id,
        blockType: defaultBlock.type,
        rule: "MIRROR-01",
        severity: "error",
        message: `Localized block[${i}] has type="${localizedBlock.type}" but default twin has type="${defaultBlock.type}"`,
        fixHint: `Change localized block[${i}] type to "${defaultBlock.type}"`,
      });
      continue;
    }

    const defaultProps = defaultBlock.props ?? {};
    const localizedProps = localizedBlock.props ?? {};
    const defaultPropKeys = collectPropKeys(defaultProps);

    for (const propKey of defaultPropKeys) {
      if (!(propKey in localizedProps)) {
        violations.push({
          file: localizedRel,
          defaultTwin: defaultRel,
          blockIndex: i,
          blockId: defaultBlock.id,
          blockType: defaultBlock.type,
          rule: "MIRROR-02",
          severity: "error",
          missingProp: propKey,
          message: `Localized block[${i}] (type="${defaultBlock.type}") is missing prop "${propKey}" that exists in default-language twin`,
          fixHint: `Add "${propKey}" to block[${i}].props in the localized page (copy from default twin and translate if needed)`,
        });
        continue;
      }

      // Deep check for nested `labels` object
      if (
        propKey === "labels" &&
        typeof defaultProps.labels === "object" &&
        defaultProps.labels !== null
      ) {
        const defaultLabels = defaultProps.labels as Record<string, unknown>;
        const localizedLabels = localizedProps.labels as Record<string, unknown> | undefined;
        if (localizedLabels) {
          for (const labelKey of Object.keys(defaultLabels)) {
            if (!(labelKey in localizedLabels)) {
              violations.push({
                file: localizedRel,
                defaultTwin: defaultRel,
                blockIndex: i,
                blockId: defaultBlock.id,
                blockType: defaultBlock.type,
                rule: "MIRROR-03",
                severity: "error",
                missingProp: "labels",
                missingLabelKey: labelKey,
                message: `Localized block[${i}] (type="${defaultBlock.type}") labels object is missing key "${labelKey}" that exists in default twin`,
                fixHint: `Add "${labelKey}" to block[${i}].props.labels in the localized page`,
              });
            }
          }
        }
      }
    }
  }

  return violations;
}

export async function runPageBlocksMirrorValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PageBlocksMirrorResult>> {
  const violations: BlockMirrorViolation[] = [];

  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return {
      exitCode: 1,
      data: {
        command: "page.blocks.mirror.validate",
        status: "fail",
        pagesCompared: 0,
        violations: [],
      },
      summary: (err as Error).message,
    };
  }

  const pagesDir = join(paths.appDirectory, "src", "content", "pages");
  const filePaths = await collectPageFiles(pagesDir);

  const pages = new Map<string, ParsedPage>();
  for (const filePath of filePaths) {
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    const parsedMeta = parsePage(filePath, rel);
    if (!parsedMeta) continue;

    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const { data } = parseMarkdownFrontmatter(raw);
    const blocks = (data.blocks ?? []) as PageBlock[];
    pages.set(rel, { ...parsedMeta, blocks });
  }

  const defaultLang = await readDefaultLanguageCode(join(paths.appDirectory, "src", "content"));

  const defaultPages = new Map<string, ParsedPage>();
  const localizedPages = new Map<string, ParsedPage>();

  for (const [rel, page] of pages) {
    if (page.lang === defaultLang) {
      defaultPages.set(page.slug, page);
    } else {
      localizedPages.set(rel, page);
    }
  }

  let pagesCompared = 0;

  for (const [rel, locPage] of localizedPages) {
    const twin = defaultPages.get(locPage.slug);
    if (!twin) continue;
    pagesCompared++;

    const blockViolations = compareBlocks(twin.blocks, locPage.blocks, rel, twin.rel);
    violations.push(...blockViolations);
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        command: "page.blocks.mirror.validate",
        status: "fail",
        pagesCompared,
        violations,
      },
      summary: `page.blocks.mirror.validate: ${violations.length} violation(s) across ${pagesCompared} localized page twin(s)`,
    };
  }

  return {
    exitCode: 0,
    data: {
      command: "page.blocks.mirror.validate",
      status: "pass",
      pagesCompared,
      violations: [],
    },
    summary: `page.blocks.mirror.validate: OK (${pagesCompared} localized twin page pair(s) checked)`,
  };
}
