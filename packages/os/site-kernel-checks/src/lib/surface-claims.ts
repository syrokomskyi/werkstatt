/*
<MODULE_CONTRACT>
<purpose>
RFC-0505: shared helper that loads ratgeber claim records from
`src/content/surface/claims/{lang}/*.md`. Used by ratgeber.claim.validate
and ratgeber.provenance.validate (RG-PROV-03/RG-PROV-06).
</purpose>
<non-goals>
  <item>Do not validate claim records — the validators do that. This helper only loads and parses.</item>
  <item>Do not resolve sourceRefs or calculationInputs — callers handle resolution.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0505: initial implementation — load claim records from surface/claims/{lang}/.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { claimRecordSchema, type ClaimRecord } from "@warpgogol/share/schemas";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";

export interface LoadedClaimRecord extends ClaimRecord {
  filePath: string;
  lang: string;
}

/**
 * Load all claim records from `src/content/surface/claims/{lang}/*.md`.
 * Returns a map keyed by `claimId` for O(1) lookup.
 * Invalid records (schema parse failure) are returned in the errors array.
 */
export async function loadClaimRecords(appDir: string): Promise<{
  byId: Map<string, LoadedClaimRecord>;
  records: LoadedClaimRecord[];
  errors: Array<{ file: string; message: string }>;
}> {
  const byId = new Map<string, LoadedClaimRecord>();
  const records: LoadedClaimRecord[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  const claimsBaseDir = join(appDir, "src", "content", "surface", "claims");

  let langDirs: string[];
  try {
    langDirs = await readdir(claimsBaseDir);
  } catch {
    return { byId, records, errors };
  }

  for (const lang of langDirs) {
    const langPath = join(claimsBaseDir, lang);
    const files = await collectMarkdownFiles(langPath).catch(() => []);
    for (const file of files) {
      const raw = await readFile(file, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const result = claimRecordSchema.safeParse(data);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        errors.push({
          file,
          message: firstIssue
            ? `Claim record field "${firstIssue.path.join(".")}" — ${firstIssue.message}`
            : "Claim record schema validation failed",
        });
        continue;
      }
      const record: LoadedClaimRecord = {
        ...result.data,
        filePath: file,
        lang,
      };
      records.push(record);
      byId.set(record.claimId, record);
    }
  }

  return { byId, records, errors };
}
