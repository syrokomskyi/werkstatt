/*
<MODULE_CONTRACT>
<purpose>
RFC-0914: block.id.generate — one-time migration command that backfills missing
block ids in page content files using slugId(heading) from the canonical slug
module. Appends -2, -3 suffixes for duplicates within a page.
</purpose>
<non-goals>
  <item>Do not generate ids at build time — ids are authored content, validated by page.blocks.extract.validate.</item>
  <item>Do not touch non-page content types (prose, faq, business-profile, navigation).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0914: initial implementation of block.id.generate migration command.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parseDocument, stringify, YAMLMap, type YAMLSeq, type Pair } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectMarkdownFiles, loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { slugId } from "@warpgogol/werkstatt-shared/share/slug";
import { passResult, failResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Extract a heading string from a block's props for slug generation.
 * Checks header.heading, heading, and title in order of preference.
 */
function extractBlockHeading(block: Record<string, unknown>): string {
  const props = (block["props"] ?? block) as Record<string, unknown>;
  const header = props["header"] as Record<string, unknown> | undefined;
  if (header) {
    const heading = header["heading"];
    if (typeof heading === "string" && heading.trim()) return heading.trim();
    const subheading = header["subheading"];
    if (typeof subheading === "string" && subheading.trim()) return subheading.trim();
  }
  const heading = props["heading"];
  if (typeof heading === "string" && heading.trim()) return heading.trim();
  const title = props["title"];
  if (typeof title === "string" && title.trim()) return title.trim();
  return "";
}

/**
 * Generate a unique block id within a page, appending -2, -3 suffixes for duplicates.
 */
function generateUniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix++;
  }
  const id = `${base}-${suffix}`;
  existing.add(id);
  return id;
}

export async function runBlockIdGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.appDirectory, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const languages = manifest.i18n?.supported
    ? Object.keys(manifest.i18n.supported)
    : [defaultLanguageFromManifest(manifest)];

  const violations: string[] = [];
  let filesModified = 0;
  let blocksBackfilled = 0;
  let blocksSkipped = 0;

  for (const lang of languages) {
    const pagesDir = join(contentDir, "pages", lang);
    const pageFiles = await collectMarkdownFiles(pagesDir);
    for (const file of pageFiles) {
      const text = await readFile(file, "utf-8");
      const relativeFile = file.replace(contentDir + "/", "");

      // Parse frontmatter preserving structure
      const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const fmText = fmMatch[1];
      const doc = parseDocument(fmText);
      const blocksNode = doc.get("blocks") as YAMLSeq | undefined;

      if (!blocksNode || !blocksNode.items || blocksNode.items.length === 0) continue;

      const existingIds = new Set<string>();
      let modified = false;

      // First pass: collect existing valid ids
      for (const item of blocksNode.items) {
        if (item instanceof YAMLMap) {
          const block = item.toJSON() as Record<string, unknown>;
          const id = block["id"];
          if (typeof id === "string" && KEBAB_CASE_RE.test(id)) {
            existingIds.add(id);
          }
        }
      }

      // Second pass: backfill missing or invalid ids
      for (const item of blocksNode.items) {
        if (!(item instanceof YAMLMap)) continue;
        const block = item.toJSON() as Record<string, unknown>;
        const blockType = String(block["type"] ?? "");
        if (!blockType) continue;

        const id = block["id"];
        const hasValidId = typeof id === "string" && KEBAB_CASE_RE.test(id);

        if (!hasValidId) {
          const heading = extractBlockHeading(block);
          if (!heading) {
            violations.push(
              `${relativeFile}: block type "${blockType}" has no heading — cannot auto-generate id. Add an id manually.`,
            );
            blocksSkipped++;
            continue;
          }
          const baseId = slugId(heading);
          const newId = generateUniqueId(baseId, existingIds);
          // Set the id on the YAML node
          const existingPair = item.get("id", true) as Pair | undefined;
          if (existingPair) {
            existingPair.value = newId;
          } else {
            item.set("id", newId);
          }
          modified = true;
          blocksBackfilled++;
        }
      }

      if (modified) {
        const newFmText = stringify(doc, { lineWidth: 0 });
        const newText = text.replace(fmMatch[1], newFmText);
        if (!context.dryRun) {
          await writeFileIfChanged(file, newText);
        }
        filesModified++;
      }
    }
  }

  if (violations.length > 0) {
    return failResult("block.id.generate", violations);
  }

  return passResult(
    "block.id.generate",
    `[block.id.generate] ${filesModified} file(s) modified, ${blocksBackfilled} block(s) backfilled, ${blocksSkipped} block(s) skipped`,
  );
}
