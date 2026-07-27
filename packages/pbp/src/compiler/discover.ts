/*
<MODULE_CONTRACT>
<purpose>Phase 1: Source file discovery — scans all .md files under sourceDirectory and produces PbpSourceInventoryReport.</purpose>
<non-goals>
  <item>Does not parse file contents — that is Phase 2 (parse.ts).</item>
  <item>Does not validate entities — that is Phase 3 (validate.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 1: discover.</item>
</CHANGE_SUMMARY>
*/

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { byteHash } from "@gogol/fingerprint";
import { parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import type { PbpSourceInventoryEntry, PbpSourceInventoryReport } from "../compiler-pipeline.js";
import type { PbpCompilerInput } from "./types.js";

export async function discover(input: PbpCompilerInput): Promise<PbpSourceInventoryReport> {
  const sources: PbpSourceInventoryEntry[] = [];
  const files = collectMdFiles(input.sourceDirectory);

  for (const filePath of files) {
    const raw = readFileSync(filePath, "utf-8");
    const { data } = parseMarkdownFrontmatter(raw);

    const entityId = typeof data.id === "string" ? data.id : "";
    const schema = typeof data.schema === "string" ? data.schema : "";

    const relPath = relative(input.sourceDirectory, filePath);
    const locale = extractLocaleFromPath(relPath);

    sources.push({
      physicalPath: filePath,
      entityId,
      schema,
      locale,
      contentDigest: byteHash(raw),
    });
  }

  sources.sort((a, b) => a.entityId.localeCompare(b.entityId));

  const recordsBySchema: Record<string, number> = {};
  for (const s of sources) {
    recordsBySchema[s.schema] = (recordsBySchema[s.schema] ?? 0) + 1;
  }

  return {
    sources,
    recordsDiscovered: sources.length,
    recordsBySchema,
  };
}

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith("old-") || entry.name.startsWith("-")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory does not exist or is not readable — return empty
  }
  return results;
}

function extractLocaleFromPath(relPath: string): string {
  const parts = relPath.split(sep);
  return parts.length > 0 ? parts[0] : "";
}
