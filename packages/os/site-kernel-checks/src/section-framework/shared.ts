/*
<MODULE_CONTRACT>
<purpose>Shared types, AST-cache, and collection helpers for the RFC-0101..RFC-0106
section-framework validator suite (RFC-0111).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of section-framework.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { collectFiles } from "@warpgogol/share/fs";
import type { KernelCommandResult, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { parseAstroFile, type AstroParseHandle } from "../lib/astro-parse.ts";
import type { TagLikeNode } from "@astrojs/compiler/types";

// RFC-0120: per-call AST parse cache so the four .astro validators share parses.
const astroCache = new WeakMap<object, Map<string, Promise<AstroParseHandle>>>();
export function getAstro(context: object, file: string): Promise<AstroParseHandle> {
  let bucket = astroCache.get(context);
  if (!bucket) {
    bucket = new Map();
    astroCache.set(context, bucket);
  }
  let p = bucket.get(file);
  if (!p) {
    p = parseAstroFile(file);
    bucket.set(file, p);
  }
  return p;
}

export function isSectionCtaAncestor(n: TagLikeNode): boolean {
  return n.name === "SectionCta" || n.name === "SectionCtaGroup";
}
export function isSectionHeaderAncestor(n: TagLikeNode): boolean {
  return n.name === "SectionHeader";
}
export function isSectionImageAncestor(n: TagLikeNode): boolean {
  return n.name === "SectionImage";
}

export interface Violation {
  file: string;
  rule: string;
  message: string;
  fix?: string;
}

export interface CheckResult {
  command: string;
  status: "ok" | "fail";
  violations: Violation[];
}

export function ok(command: string): KernelCommandResult<CheckResult> {
  return {
    exitCode: 0,
    data: { command, status: "ok", violations: [] },
    summary: `OK - ${command}`,
  };
}

export function fail(command: string, violations: Violation[]): KernelCommandResult<CheckResult> {
  return {
    exitCode: 1,
    data: { command, status: "fail", violations },
    summary: `FAIL - ${command} (${violations.length} violation${violations.length === 1 ? "" : "s"})`,
  };
}

// RFC-0108 §"Section migration" table marks these slugs as "utility (no
// migration needed)" — they are route-orchestration helpers (breadcrumbs trail,
// navigation menu) that intentionally do not flow through <SectionShell> /
// <SectionHeader> / <SectionBody-*>. RFC-0126 codifies this allow-list so the
// SHELL and BG validators stop reporting structural violations against them.
export const UTILITY_SECTION_SLUGS: ReadonlySet<string> = new Set(["breadcrumbs", "navigation"]);

// Extract `<slug>` from a path under packages/ui/src/sections/<slug>/...
export function sectionSlugOf(relPath: string): string | null {
  const m = relPath.match(/packages\/ui\/src\/sections\/([^/]+)\//);
  return m ? m[1] : null;
}

export function isUtilitySection(relPath: string): boolean {
  const slug = sectionSlugOf(relPath);
  return slug !== null && UTILITY_SECTION_SLUGS.has(slug);
}

export async function walkAstroSections(workspaceRoot: string): Promise<string[]> {
  const root = join(workspaceRoot, "packages", "ui", "src", "sections");
  return collectFiles(root, { extensions: [".astro"], ignore: () => false });
}

export async function walkSectionManifests(workspaceRoot: string): Promise<string[]> {
  const root = join(workspaceRoot, "packages", "ui", "src", "sections");
  return collectFiles(root, { extensions: [".manifest.yaml"], ignore: () => false });
}

export async function walkArchetypeYamls(workspaceRoot: string): Promise<string[]> {
  const root = join(workspaceRoot, "packages", "ontology", "archetypes", "sections");
  const entries = await collectFiles(root, { extensions: [".yaml"], ignore: () => false });
  return entries;
}

// ---------------------------------------------------------------------------
// Per-app helpers (RFC-0116)
// ---------------------------------------------------------------------------

export function resolveAppSlug(context: KernelRuntimeContext): string | null {
  const dir = context.site?.directory;
  if (!dir) return null;
  return dir.split(/[/\\]/).pop() ?? null;
}

export function extractFrontmatter(raw: string): Record<string, unknown> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    return parseYaml(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function collectPageFiles(pagesDir: string): Promise<string[]> {
  return collectFiles(pagesDir, { extensions: [".md"], ignore: () => false });
}

export interface BlockLike {
  id?: string;
  type?: string;
  use?: string;
  props?: Record<string, unknown>;
}

export function getBlocks(fm: Record<string, unknown> | null): BlockLike[] {
  if (!fm) return [];
  const blocks = fm.blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks as BlockLike[];
}

export function blockType(b: BlockLike): string {
  return b.type ?? b.use ?? "";
}
