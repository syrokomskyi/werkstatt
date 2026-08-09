/*
<MODULE_CONTRACT>
<purpose>Phase 2: Parses YAML frontmatter from discovered source files into raw entity objects.</purpose>
<non-goals>
  <item>Does not validate entities — that is Phase 3 (validate.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 2: parse.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type { PbpSourceInventoryReport } from "../compiler-pipeline.js";

export interface ParsedEntity {
  data: Record<string, unknown>;
  body: string;
  physicalPath: string;
  locale: string;
  entityId: string;
  schema: string;
}

export async function parse(inventory: PbpSourceInventoryReport): Promise<ParsedEntity[]> {
  const results: ParsedEntity[] = [];

  for (const source of inventory.sources) {
    const raw = readFileSync(source.physicalPath, "utf-8");
    const { data, content } = parseMarkdownFrontmatter(raw);

    results.push({
      data,
      body: content,
      physicalPath: source.physicalPath,
      locale: source.locale,
      entityId: source.entityId,
      schema: source.schema,
    });
  }

  results.sort((a, b) => a.entityId.localeCompare(b.entityId));
  return results;
}
