/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0073 content.voice.lint using onboarding voice profile plus biome and family constraints.</purpose>
<non-goals>
  <item>Do not rewrite visitor-facing copy.</item>
  <item>Do not parse prompt-only source documents like 28-tone-of-voice.md directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Add deterministic voice lint validator.</item>
  <item>RFC-0088: Switch to word-boundary matching for single-token forbidden phrases. The .includes() match was flagging "rehype" against forbidden "hype" in generated open-source attribution lists.</item>
  <item>RFC-0507: Add VOICE-CTA-01 — warn when ratgeber article prose contains a markdown price table with 3+ data rows.</item>
  <item>RFC-0513: Add profile-specific prohibited patterns scoped to prose files matching people slug pattern.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { readScopeFiles, outOfScope } from "./scope.ts";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import {
  flattenStringValues,
  getContentDisciplinePaths,
  collectMarkdownFilesSafe,
  readMarkdownDocument,
} from "./content-discipline.ts";
import { pathExists, findLineNumbersContaining } from "./content-discipline.ts";
import {
  parseVoiceProfileFile,
  stripAllowedQuoteBlocks,
  type VoiceProfile,
} from "@gogol/share/content-discipline";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

interface FamilyVoiceTemplate {
  family?: string;
  voice?: {
    avoids?: string[];
    prefers?: string[];
  };
}

interface BiomeTemplate {
  family?: string;
  constraints?: {
    forbidPhrases?: string[];
  };
}

/**
 * Word-boundary-aware substring match for forbidden phrases. Catches the
 * "rehype contains hype" false positive the naive `.includes()` produced
 * against auto-generated open-source attribution lists. Multi-word phrases
 * keep their full literal form (spaces are word boundaries anyway).
 */
export function matchesForbiddenPhrase(haystackLower: string, phrase: string): boolean {
  const needle = phrase.toLocaleLowerCase().trim();
  if (!needle) return false;
  // Single-token phrases get word-boundary protection. We use Unicode-aware
  // property escapes \p{L}\p{N} so German umlauts ("günstig") and other
  // non-ASCII letters match correctly inside text.
  if (/^\S+$/.test(needle)) {
    try {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "u");
      return pattern.test(haystackLower);
    } catch {
      return haystackLower.includes(needle);
    }
  }
  return haystackLower.includes(needle);
}

export async function runContentVoiceLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const allow = readScopeFiles(input); // RFC-0139: optional --scope-files (null = whole-app)
  const paths = getContentDisciplinePaths(context);
  const violations: string[] = [];
  const warnings: string[] = [];
  const contentDir = paths.contentDirectory;

  const { manifest } = await loadSystemManifest(contentDir);
  const identity = (manifest as { identity?: { biome?: string } }).identity;
  const biomeId = String(identity?.biome ?? "");

  // Per-app voice profile: a profile is authored for exactly one client and must
  // only be enforced against that client's app. Resolution order:
  //   1. App-local committed profile: <app>/.author/voice-profile.yaml
  //   2. Shared onboarding staging output, but ONLY when its `client` matches the
  //      current app name. The staging dir (onboarding/.output/04-author) holds a
  //      single in-flight onboarding run at a time, so without this guard an
  //      already-onboarded app would be linted against another client's voice
  //      (e.g. webgogol-com's mandatory phrases leaking into nicaragua-projekt).
  // Apps with no matching profile are scanned with no forbidden/mandatory
  // constraints rather than inheriting a foreign voice.
  const siteName = context.site?.name ?? "";
  const appLocalProfilePath = join(paths.appDirectory, ".author", "voice-profile.yaml");
  const sharedProfilePath = join(paths.onboardingAuthorDirectory, "voice-profile.yaml");
  let voiceProfile: VoiceProfile | null = null;
  if (await pathExists(appLocalProfilePath)) {
    voiceProfile = parseVoiceProfileFile(await readFile(appLocalProfilePath, "utf8"));
  } else if (await pathExists(sharedProfilePath)) {
    const candidate = parseVoiceProfileFile(await readFile(sharedProfilePath, "utf8"));
    if (candidate.client === siteName) {
      voiceProfile = candidate;
    }
  }

  let biomeData: BiomeTemplate = {};
  let familyData: FamilyVoiceTemplate = {};
  if (biomeId) {
    const biomePath = join(
      context.workspaceRoot,
      "packages",
      "ontology",
      "biomes",
      `${biomeId}.yaml`,
    );
    if (await pathExists(biomePath)) {
      biomeData = parseYaml(await readFile(biomePath, "utf8")) as BiomeTemplate;
      if (biomeData.family) {
        const familyTonePath = join(
          context.workspaceRoot,
          "packages",
          "ontology",
          "site-families",
          biomeData.family,
          "tone-of-voice.template.yaml",
        );
        if (await pathExists(familyTonePath)) {
          familyData = parseYaml(await readFile(familyTonePath, "utf8")) as FamilyVoiceTemplate;
        }
      }
    }
  }

  const forbiddenPhrases = [
    ...(voiceProfile?.forbiddenPhrases ?? []),
    ...(biomeData.constraints?.forbidPhrases ?? []),
    ...(familyData.voice?.avoids ?? []),
  ].filter(Boolean);

  const preferredPhrasings = voiceProfile?.preferredPhrasings ?? [];
  const mandatoryPhrases = voiceProfile?.mandatoryPhrases ?? [];

  const directories = [
    paths.pagesDirectory,
    paths.proseDirectory,
    paths.navigationDirectory,
    paths.siteDirectory,
  ];
  const files = (
    await Promise.all(directories.map((directory) => collectMarkdownFilesSafe(directory)))
  ).flat();
  let combinedCorpus = "";

  for (const filePath of files) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    // RFC-0139: out-of-scope files still feed the app-wide mandatory-phrase corpus,
    // but their per-file forbidden/preferred findings are suppressed.
    const skip = outOfScope(allow, doc.relativeFile);
    const strings = [
      ...flattenStringValues(doc.frontmatter),
      ...(doc.body.trim() ? [{ path: "$body", value: doc.body }] : []),
    ];

    for (const entry of strings) {
      const scannedValue = stripAllowedQuoteBlocks(entry.value);
      combinedCorpus += `\n${scannedValue}`;
      if (skip) continue;
      const scannedLower = scannedValue.toLocaleLowerCase();

      for (const phrase of forbiddenPhrases) {
        if (!phrase) continue;
        // Word-boundary match: forbidden phrase "hype" must NOT trigger on
        // "rehype" inside a generated open-source attribution list. Multi-word
        // phrases match as substrings (the inner spaces ARE word boundaries),
        // but single tokens get strict boundary checks. Falls back to
        // substring match when the phrase contains regex metachars we cannot
        // safely escape into a Unicode-aware boundary check.
        if (matchesForbiddenPhrase(scannedLower, phrase)) {
          const lines = findLineNumbersContaining(doc.source, phrase);
          violations.push(
            `${doc.relativeFile}${lines[0] ? `:${lines[0]}` : ""} — forbidden phrase \"${phrase}\" in ${entry.path}`,
          );
        }
      }

      for (const phrasing of preferredPhrasings) {
        if (matchesForbiddenPhrase(scannedLower, phrasing.avoid)) {
          const lines = findLineNumbersContaining(doc.source, phrasing.avoid);
          warnings.push(
            `${doc.relativeFile}${lines[0] ? `:${lines[0]}` : ""} — avoid \"${phrasing.avoid}\", prefer \"${phrasing.prefer}\"`,
          );
        }
      }
    }
  }

  // VOICE-CTA-01 (RFC-0507): Ratgeber article prose must not render a full price table.
  // Scan prose files matching ratgeber-* for markdown tables with 3+ data rows where any cell
  // matches a price pattern (€, EUR, or PBP {business-profile...price...} reference).
  const ratgeberProseDir = paths.proseDirectory;
  if (ratgeberProseDir) {
    const proseFiles = await collectMarkdownFilesSafe(ratgeberProseDir);
    const pricePattern = /[€EUR]|\{business-profile[^}]*price[^}]*\}/i;
    for (const filePath of proseFiles) {
      const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
      const isRatgeber = /ratgeber/i.test(doc.relativeFile);
      if (!isRatgeber) continue;
      const lines = doc.body.split("\n");
      let inTable = false;
      let dataRowCount = 0;
      let tableStartLine = 0;
      let tableHasPrice = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (line.startsWith("|") && line.endsWith("|")) {
          if (!inTable) {
            inTable = true;
            tableStartLine = i + 1;
            dataRowCount = 0;
            tableHasPrice = false;
          }
          // Skip header separator rows (|---|---|)
          if (/^\|[\s-:]+\|/.test(line)) continue;
          // Skip the first data row (header row is the first | line, separator is second)
          // Count only actual data rows (3rd line onward in a markdown table)
          dataRowCount++;
          if (pricePattern.test(line)) tableHasPrice = true;
        } else {
          if (inTable && dataRowCount >= 4 && tableHasPrice) {
            // 4+ | lines = header + separator + 3+ data rows
            warnings.push(
              `VOICE-CTA-01: ${doc.relativeFile}:${tableStartLine} — ratgeber article contains a markdown price table with 3+ data rows; /preis/ is the canonical price source`,
            );
          }
          inTable = false;
          dataRowCount = 0;
          tableHasPrice = false;
        }
      }
      // Check at end of file
      if (inTable && dataRowCount >= 4 && tableHasPrice) {
        warnings.push(
          `VOICE-CTA-01: ${doc.relativeFile}:${tableStartLine} — ratgeber article contains a markdown price table with 3+ data rows; /preis/ is the canonical price source`,
        );
      }
    }
  }

  // RFC-0513: Profile-specific prohibited patterns scoped to prose files matching
  // the people collection slug pattern (e.g. prose/de/{slug}-beruflich.md, -nachweise.md, etc.)
  const profileProsePatterns: Array<{ phrase: string; aiAgentOnly?: boolean }> = [
    { phrase: "garantierte rankings" },
    { phrase: "automatische konvertierung" },
    { phrase: "fehlerfrei", aiAgentOnly: true },
    { phrase: "100% genau" },
    { phrase: "autonom ohne menschliche aufsicht", aiAgentOnly: true },
  ];
  const profileProseSuffixes = [
    "-beruflich",
    "-nachweise",
    "-persoenlich",
    "-rechte",
    "-verantwortlichkeit",
    "-technik",
    "-einschraenkungen",
    "-prava",
    "-vidpovidalnist",
    "-tehnika",
    "-obmezhennia",
  ];
  if (paths.proseDirectory) {
    const proseFiles = await collectMarkdownFilesSafe(paths.proseDirectory);
    for (const filePath of proseFiles) {
      const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
      const isProfileProse = profileProseSuffixes.some((suffix) =>
        doc.relativeFile.includes(suffix),
      );
      if (!isProfileProse) continue;
      const isAiAgentProse =
        /-rechte|-verantwortlichkeit|-technik|-einschraenkungen|-prava|-vidpovidalnist|-tehnika|-obmezhennia/i.test(
          doc.relativeFile,
        );
      const strings = [
        ...flattenStringValues(doc.frontmatter),
        ...(doc.body.trim() ? [{ path: "$body", value: doc.body }] : []),
      ];
      for (const entry of strings) {
        const scannedLower = entry.value.toLocaleLowerCase();
        for (const { phrase, aiAgentOnly } of profileProsePatterns) {
          if (aiAgentOnly && !isAiAgentProse) continue;
          if (matchesForbiddenPhrase(scannedLower, phrase)) {
            const lines = findLineNumbersContaining(doc.source, phrase);
            violations.push(
              `${doc.relativeFile}${lines[0] ? `:${lines[0]}` : ""} — RFC-0513 prohibited profile phrase "${phrase}" in ${entry.path}`,
            );
          }
        }
      }
    }
  }

  for (const phrase of mandatoryPhrases) {
    if (!combinedCorpus.toLocaleLowerCase().includes(phrase.toLocaleLowerCase())) {
      violations.push(`mandatory phrase missing across scanned content: \"${phrase}\"`);
    }
  }

  for (const warning of warnings) {
    context.logger.warn(warning);
  }

  return {
    exitCode: violations.length > 0 ? 1 : 0,
    data: {
      command: "content.voice.lint",
      status: violations.length > 0 ? "fail" : "pass",
      violations,
      warnings,
    },
    summary:
      violations.length > 0
        ? `content.voice.lint: ${violations.length} violation(s), ${warnings.length} warning(s)`
        : `content.voice.lint: OK (${warnings.length} warning(s))`,
  };
}
