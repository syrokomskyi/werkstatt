/*
<MODULE_CONTRACT>
<purpose>Shared constants and helpers for the three-way mirroring convention
(ARCHITECTURE_DNA #5) used by mirror-triad, dispatcher-sync, and quartet-mirror.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of structure.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { collectMarkdownFiles } from "@warpgogol/werkstatt-site/content";

// @ai-invariant The CONTENT_COMPONENTS_SUBPATH and SCHEMAS_COMPONENTS_SUBPATH constants define
// the canonical relative paths used by the three-way mirroring convention (ARCHITECTURE_DNA #5).
// Changing these paths breaks the triad check for all apps.
export const CONTENT_COMPONENTS_SUBPATH = "components";
export const SCHEMAS_SUBPATH = join("schemas", "components");

export async function collectLangSubdirs(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory() && /^[a-z]{2}$/i.test(e.name)).map((e) => e.name);
}

export async function collectTsFiles(dirPath: string): Promise<string[]> {
  return collectFiles(dirPath, { extensions: [".ts"], ignore: () => false });
}

// RFC-0020: content .md files in src/content/components/ now carry the same layer suffixes
// as their .astro counterparts (-component for root, -section for section/).
// stripContentSuffix strips those suffixes to yield logical identities so that triad,
// quartet, and dispatcher checks can compare them against schema keys (which stay logical).
const LAYER_SUFFIXES_CONTENT = ["-component", "-section"] as const;

export function stripContentSuffix(stem: string): string {
  for (const suffix of LAYER_SUFFIXES_CONTENT) {
    if (stem.endsWith(suffix)) return stem.slice(0, stem.length - suffix.length);
  }
  return stem;
}

export async function collectComponentPaths(contentComponentsDir: string): Promise<Set<string>> {
  const paths = new Set<string>();
  const langDirs = await collectLangSubdirs(contentComponentsDir);
  for (const lang of langDirs) {
    const langDir = join(contentComponentsDir, lang);
    const mdFiles = await collectMarkdownFiles(langDir);
    for (const file of mdFiles) {
      const rawRel = relative(langDir, file).replace(/\\/g, "/").replace(/\.md$/i, "");
      const parts = rawRel.split("/");
      // RFC-0020 extended: strip -component suffix only from root-level files (no subdir).
      // Subdirectory files (e.g. section/hero-section.md) keep the suffix as part of their
      // logical identity because their schema files also carry the suffix (hero-section.ts).
      if (parts.length === 1) {
        parts[0] = stripContentSuffix(parts[0]);
      }
      paths.add(parts.join("/"));
    }
  }
  return paths;
}

/**
 * Extracts string keys from a named TypeScript object literal in the given source text.
 * Handles both quoted (`"section/Hero"`) and unquoted (`Breadcrumbs`) key forms.
 */
export function extractDispatcherKeys(fileContent: string, objectName: string): string[] {
  const startPattern = new RegExp(`\\b${objectName}\\s*=\\s*\\{`);
  const startMatch = fileContent.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return [];

  const startIndex = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = startIndex;
  while (i < fileContent.length && depth > 0) {
    const ch = fileContent[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }

  const objectBody = fileContent.slice(startIndex, i - 1);
  const keys: string[] = [];
  const keyRegex = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s*:/gm;
  for (const match of objectBody.matchAll(keyRegex)) {
    const key = match[1] ?? match[2] ?? match[3];
    if (key) keys.push(key);
  }
  return keys;
}
