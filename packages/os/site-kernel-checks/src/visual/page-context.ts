/*
<MODULE_CONTRACT>
<purpose>
RFC-0233 Visual Control System — page-context loader. Loads a thin-app's
authored pages as ordered block sequences so visual rules can reason about a
block's POSITION (first / last / adjacency), the gap the isolated section
schemas cannot see. Pairs structured frontmatter (via YAML) with raw-text line
lookups so emitted Diagnostics carry file:line locators.
</purpose>
<non-goals>
  <item>Do not evaluate visual rules; pure loading only (rules live in rules.ts).</item>
  <item>Do not resolve visibility/entitlement gating yet — authored order is the Tier-1 source of truth (RFC-0233 Open Q1).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0233: initial Tier-1 page-context loader.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { collectFiles } from "@gogol/share/fs";

/** A single authored background descriptor (kind + params), as written. */
export type VisualBackground = Record<string, unknown>;

export interface VisualBlock {
  /** Zero-based position in the authored blocks[] array. */
  index: number;
  id?: string;
  type: string;
  background?: VisualBackground;
  /** 1-based line of the `background:` key in the source file, when locatable. */
  backgroundLine?: number;
}

export interface VisualPage {
  /** Absolute path. */
  file: string;
  /** Workspace-relative POSIX path for Diagnostic locators. */
  relFile: string;
  blocks: VisualBlock[];
}

interface RawBlock {
  id?: string;
  type?: string;
  use?: string;
  props?: { background?: unknown };
  background?: unknown;
}

function extractFrontmatter(raw: string): Record<string, unknown> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    return parseYaml(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toBackground(b: RawBlock): VisualBackground | undefined {
  const bg = b.props?.background ?? b.background;
  if (bg && typeof bg === "object" && !Array.isArray(bg)) {
    return bg as VisualBackground;
  }
  return undefined;
}

/**
 * Best-effort source line of a block's `background:` key. We locate the block by
 * its unique `- id: <id>` line, then take the first `background:` key before the
 * next `- id:` sibling. Returns undefined when the block has no id or no match.
 */
function locateBackgroundLine(lines: string[], id: string | undefined): number | undefined {
  if (!id) return undefined;
  const idPattern = new RegExp(
    `^\\s*-\\s+id:\\s+${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
  );
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (idPattern.test(lines[i]!)) {
      start = i;
      break;
    }
  }
  if (start === -1) return undefined;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*-\s+id:\s+/.test(lines[i]!)) break; // next sibling block
    if (/^\s*background:\s*$/.test(lines[i]!)) return i + 1;
  }
  return undefined;
}

async function collectPageFiles(pagesDir: string): Promise<string[]> {
  const files = await collectFiles(pagesDir, { extensions: [".md"], ignore: () => false });
  return files.sort();
}

/**
 * Load every authored page under apps/<id>/src/content/pages as an ordered
 * VisualPage. Pages without a parseable blocks[] array yield an empty block list.
 */
export async function loadVisualPages(
  appDir: string,
  workspaceRoot: string,
): Promise<VisualPage[]> {
  const pagesDir = join(appDir, "src", "content", "pages");
  const files = await collectPageFiles(pagesDir);
  const pages: VisualPage[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8").catch(() => null);
    if (raw === null) continue;
    const fm = extractFrontmatter(raw);
    const rawBlocks = Array.isArray(fm?.blocks) ? (fm!.blocks as RawBlock[]) : [];
    const lines = raw.split("\n");

    const blocks: VisualBlock[] = rawBlocks.map((b, index) => ({
      index,
      id: typeof b.id === "string" ? b.id : undefined,
      type: (b.type ?? b.use ?? "") as string,
      background: toBackground(b),
      backgroundLine: locateBackgroundLine(lines, typeof b.id === "string" ? b.id : undefined),
    }));

    pages.push({
      file,
      relFile: relative(workspaceRoot, file).split("\\").join("/"),
      blocks,
    });
  }

  return pages;
}
