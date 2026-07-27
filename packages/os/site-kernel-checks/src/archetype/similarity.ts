/*
<MODULE_CONTRACT>
<purpose>section.similarity.report — reports rough section similarity (shared intent +
role match) for library growth review.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of archetype.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { loadUiManifestFiles } from "./shared.ts";

interface SimilarityRow {
  left: string;
  right: string;
  score: number;
  sharedIntents: string[];
  sameRole: boolean;
}

interface SimilarityResult {
  sections: number;
  comparisons: number;
  topPairs: SimilarityRow[];
}

export async function runSectionSimilarityReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SimilarityResult>> {
  const manifests = (await loadUiManifestFiles(context.workspaceRoot)).filter(
    ({ manifest }) => manifest.layer === "section",
  );
  const rows: SimilarityRow[] = [];
  for (let index = 0; index < manifests.length; index += 1) {
    for (let next = index + 1; next < manifests.length; next += 1) {
      const left = manifests[index].manifest;
      const right = manifests[next].manifest;
      const sharedIntents = left.intent.filter((intent) => right.intent.includes(intent));
      const sameRole = left.role === right.role;
      const score = sharedIntents.length * 10 + (sameRole ? 25 : 0);
      rows.push({ left: left.id, right: right.id, score, sharedIntents, sameRole });
    }
  }
  rows.sort(
    (a, b) => b.score - a.score || a.left.localeCompare(b.left) || a.right.localeCompare(b.right),
  );

  return {
    exitCode: 0,
    data: {
      sections: manifests.length,
      comparisons: rows.length,
      topPairs: rows.slice(0, 10),
    },
    summary: `OK - compared ${manifests.length} section manifests`,
  };
}
