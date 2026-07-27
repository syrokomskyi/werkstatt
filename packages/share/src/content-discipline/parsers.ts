/*
<MODULE_CONTRACT>
<purpose>Parses RFC-0073 content-discipline artifacts and exposes reusable normalization helpers for validators.</purpose>
<non-goals>
  <item>Do not read files from disk.</item>
  <item>Do not resolve Astro content references here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Add shared parsers and normalization helpers for content-discipline validators.</item>
  <item>RFC-0082: Delegate YAML reading to @warpgogol/share/onboarding-yaml so single-doc and two-doc RFC-0076-headed files both parse correctly.</item>
</CHANGE_SUMMARY>
*/

import { parseOnboardingArtifactPayload } from "../onboarding-yaml/index.ts";
import {
  contentAtomsFileSchema,
  coverageLedgerEntrySchema,
  voiceProfileSchema,
  type ContentAtomsFile,
  type CoverageLedgerEntry,
  type VoiceProfile,
} from "./types.ts";

const COVERAGE_LEDGER_LINE = /^-\s+(atom-\d{4,})\s+·\s+reason:\s+([a-z-]+)\s+·\s+note:\s+(.+)$/;

export function parseContentAtomsFile(source: string): ContentAtomsFile {
  return parseOnboardingArtifactPayload(source, contentAtomsFileSchema);
}

export function parseVoiceProfileFile(source: string): VoiceProfile {
  return parseOnboardingArtifactPayload(source, voiceProfileSchema);
}

export function parseCoverageLedgerMarkdown(source: string): CoverageLedgerEntry[] {
  const entries: CoverageLedgerEntry[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(COVERAGE_LEDGER_LINE);
    if (!match) {
      continue;
    }
    const [, atomId, reason, note] = match;
    entries.push(
      coverageLedgerEntrySchema.parse({
        atomId,
        reason,
        note: note.trim(),
      }),
    );
  }
  return entries;
}

export function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\{\{quote\}\}[\s\S]*?\{\{\/quote\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function stripAllowedQuoteBlocks(value: string): string {
  return value.replace(/\{\{quote\}\}[\s\S]*?\{\{\/quote\}\}/g, " ");
}
