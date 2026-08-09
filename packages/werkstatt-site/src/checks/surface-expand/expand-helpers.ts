/*
<MODULE_CONTRACT>
<purpose>Internal helpers for expandBlueprint — dataset loading, record matching, and freshness checks.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted internal helpers from expand.ts into expand-helpers.ts.</item>
  <item>Architecture review 2026-07-10: remove resolveGeoProvider — logic absorbed into GeoService.providerEntries.</item>
</CHANGE_SUMMARY>
*/

import { basename, join, relative } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  matchesRecord,
  type AxisFieldMap,
  type Blueprint,
  type SurfaceRecord,
  type VirtualRouteEntry,
} from "@warpgogol/surface";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";

export interface DatasetEntry {
  slug: string;
  data: Record<string, unknown>;
}

export async function loadDataset(
  appDir: string,
  collection: string,
  lang: string,
): Promise<DatasetEntry[]> {
  const dir = join(appDir, "src", "content", "surface", collection, lang);
  let files: string[];
  try {
    files = await collectMarkdownFiles(dir);
  } catch {
    return [];
  }
  const entries: DatasetEntry[] = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const { data } = parseMarkdownFrontmatter(raw);
    const relPath = relative(dir, file).replace(/\\/g, "/");
    const relSlug = relPath.replace(/\//g, "-").replace(/\.md$/, "");
    const hasSubfolder = relPath.includes("/");
    const slug = hasSubfolder
      ? typeof data.slug === "string" && data.slug.trim()
        ? data.slug.trim()
        : relSlug
      : basename(file).replace(/\.md$/, "");
    entries.push({ slug, data });
  }
  if (collection === "demands") {
    const assetsDir = join(dir, "assets");
    for (const entry of entries) {
      if (entry.data.image) continue;
      const imgPath = join(assetsDir, `${entry.slug}.webp`);
      if (existsSync(imgPath)) {
        entry.data.image = entry.slug;
        entry.data.imageAlt = typeof entry.data.name === "string" ? entry.data.name : entry.slug;
      }
    }
  }
  return entries;
}

export function blueprintLangs(bp: Blueprint): string[] {
  const langs = new Set<string>();
  for (const level of bp.levels) for (const lang of Object.keys(level.slug)) langs.add(lang);
  return [...langs];
}

export function ageDays(isoDate: string, now: number): number | null {
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

export function hasEvidenceValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasEvidenceValue);
  if (typeof value !== "string") return value !== undefined && value !== null;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !/^(need_this|todo|tbd|placeholder|n\/a)$/i.test(trimmed);
}

export function matchingRecordsForEntry(
  records: readonly SurfaceRecord[],
  entry: VirtualRouteEntry,
  axisFieldMap: AxisFieldMap,
): SurfaceRecord[] {
  return records.filter((r) => matchesRecord(r, entry.axes, axisFieldMap));
}
