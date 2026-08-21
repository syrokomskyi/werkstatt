/*
<MODULE_CONTRACT>
<purpose>
RFC-0901: Cross-locale structural parity validation for translated content.
Three command handlers: translation.parity.validate, translation.parity.review,
translation.parity.suppress. Detects section/paragraph/sentence count mismatches
between locale variants of authored markdown content.
</purpose>
<non-goals>
<item>Do not perform semantic comparison of translation content — only structural unit counts.</item>
<item>Do not replace mirroring.validate (file presence) — this extends it with structural parity.</item>
<item>Do not check frontmatter field parity — body structure only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>RFC-0901: initial implementation of translation parity contour (validate, review, suppress).</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
  loadSystemManifest,
} from "@warpgogol/werkstatt-site/content";
import {
  splitMarkdownSections,
  extractParagraphs,
  splitSentences,
} from "@warpgogol/werkstatt-shared/share/semantic";
import { slugId } from "@warpgogol/werkstatt-shared/share/slug";
import { diagnosticsResult, passResult, failResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MissingItem {
  type: "section" | "paragraph" | "sentence";
  index: number;
  heading?: string;
  sourceText: string;
}

interface ParityFinding {
  file: string;
  sourceFile: string;
  targetFile: string;
  ruleId: "PARITY-SECTION-COUNT" | "PARITY-PARAGRAPH-COUNT" | "PARITY-SENTENCE-COUNT";
  section?: string;
  sourceLocale: string;
  targetLocale: string;
  sourceCount: number;
  targetCount: number;
  severity: "error" | "warning";
  message: string;
  fixHint: string;
  sourceExcerpt?: string;
  missingItems?: MissingItem[];
}

interface SuppressionRecord {
  file: string;
  ruleId: string;
  section?: string;
  reason: string;
  approvedAt: string;
}

interface ContentSection {
  id: string;
  heading: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEGAL_FILENAMES = new Set([
  "impressum.md",
  "datenschutz.md",
  "agb.md",
  "widerruf.md",
  "barrierefreiheit.md",
]);

const CONTENT_DOMAINS = [
  "prose",
  "pages",
  "business-profile",
  "navigation",
  "faq",
  "people",
  "site",
] as const;

const PARITY_RULE_IDS = [
  "PARITY-SECTION-COUNT",
  "PARITY-PARAGRAPH-COUNT",
  "PARITY-SENTENCE-COUNT",
] as const;

const SUPPRESSIONS_FILENAME = "translation-parity.suppressions.yaml";
const REVIEW_FILENAME = "translation-parity-review.yaml";

// ---------------------------------------------------------------------------
// Suppression schema
// ---------------------------------------------------------------------------

const suppressionRecordSchema = z.object({
  file: z.string().min(1),
  ruleId: z.string().min(1),
  section: z.string().optional(),
  reason: z.string().min(1),
  approvedAt: z.string().min(1),
});

const suppressionsFileSchema = z.object({
  suppressions: z.array(suppressionRecordSchema).default([]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLegalDocument(filename: string): boolean {
  return LEGAL_FILENAMES.has(filename.toLowerCase());
}

function getFlagString(input: KernelCommandInput, key: string): string | undefined {
  const val = input.flags[key];
  return typeof val === "string" ? val : undefined;
}

function extractBlockHeading(block: Record<string, unknown>): string {
  const props = (block["props"] ?? block) as Record<string, unknown>;
  const header = props["header"] as Record<string, unknown> | undefined;
  if (header) {
    const heading = header["heading"];
    if (typeof heading === "string" && heading.trim()) return heading.trim();
    const subheading = header["subheading"];
    if (typeof subheading === "string" && subheading.trim()) return subheading.trim();
  }
  const heading = props["heading"];
  if (typeof heading === "string" && heading.trim()) return heading.trim();
  const title = props["title"];
  if (typeof title === "string" && title.trim()) return title.trim();
  return "";
}

function extractBlockBody(block: Record<string, unknown>): string {
  const props = (block["props"] ?? block) as Record<string, unknown>;
  const parts: string[] = [];

  const header = props["header"] as Record<string, unknown> | undefined;
  if (header) {
    if (typeof header["heading"] === "string") parts.push(header["heading"]);
    if (typeof header["subheading"] === "string") parts.push(header["subheading"]);
  }

  for (const key of ["body", "content", "text", "description", "lead"]) {
    const val = props[key];
    if (typeof val === "string" && val.trim()) parts.push(val);
  }

  const items = props["items"];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (typeof item === "object" && item !== null) {
        const itemObj = item as Record<string, unknown>;
        if (typeof itemObj["title"] === "string") parts.push(itemObj["title"]);
        if (typeof itemObj["description"] === "string") parts.push(itemObj["description"]);
      }
    }
  }

  const facts = props["facts"];
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      if (typeof fact === "string") parts.push(fact);
    }
  }

  return parts.join("\n\n");
}

function extractPageSections(frontmatter: Record<string, unknown>): ContentSection[] {
  const blocks = (frontmatter["blocks"] as Array<Record<string, unknown>> | undefined) ?? [];
  const sections: ContentSection[] = [];
  for (const block of blocks) {
    const blockType = String(block["type"] ?? "");
    if (!blockType) continue;
    const blockId = block["id"];
    if (typeof blockId !== "string" || !blockId) continue;
    const heading = extractBlockHeading(block);
    const body = extractBlockBody(block);
    sections.push({ id: blockId, heading, body });
  }
  return sections;
}

function extractProseSections(markdownBody: string): ContentSection[] {
  return splitMarkdownSections(markdownBody, 2).map((section) => ({
    id: slugId(section.heading),
    heading: section.heading,
    body: section.body,
  }));
}

async function loadSuppressions(
  workpieceRoot: string,
): Promise<{ records: SuppressionRecord[]; raw: string | null }> {
  const filePath = join(workpieceRoot, SUPPRESSIONS_FILENAME);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = parseYaml(raw) as unknown;
    const result = suppressionsFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `PARITY-SUP-01: Invalid suppression file: ${result.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
    return { records: result.data.suppressions as SuppressionRecord[], raw };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: [], raw: null };
    }
    throw err;
  }
}

function isSuppressed(finding: ParityFinding, suppressions: SuppressionRecord[]): boolean {
  return suppressions.some((sup) => {
    if (sup.file !== finding.file) return false;
    if (sup.ruleId !== finding.ruleId) return false;
    if (!sup.section) return true;
    if (!finding.section) return false;
    return sup.section === finding.section;
  });
}

function checkDuplicateSuppressions(suppressions: SuppressionRecord[]): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const sup of suppressions) {
    const key = `${sup.file}|${sup.ruleId}|${sup.section ?? ""}`;
    if (seen.has(key)) {
      violations.push(`PARITY-SUP-03: Duplicate suppression for ${key}`);
    }
    seen.add(key);
  }
  return violations;
}

function checkStaleSuppressions(
  suppressions: SuppressionRecord[],
  knownFiles: Set<string>,
  knownSectionsByFile: Map<string, Set<string>>,
): string[] {
  const violations: string[] = [];
  for (const sup of suppressions) {
    if (!knownFiles.has(sup.file)) {
      violations.push(`PARITY-SUP-02: Stale suppression — file "${sup.file}" no longer exists`);
      continue;
    }
    if (sup.section) {
      const sections = knownSectionsByFile.get(sup.file);
      if (sections && !sections.has(sup.section)) {
        violations.push(
          `PARITY-SUP-02: Stale suppression — section "${sup.section}" in "${sup.file}" no longer exists`,
        );
      }
    }
  }
  return violations;
}

async function getLocaleDirs(contentDir: string, domain: string): Promise<string[]> {
  const domainDir = join(contentDir, domain);
  try {
    const entries = await readdir(domainDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && /^[a-z]{2}$/i.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

async function loadDeclaredLocales(contentDir: string): Promise<Map<string, string[]>> {
  const declaredLocales = new Map<string, string[]>();
  try {
    const systemRaw = await readFile(join(contentDir, "system.md"), "utf8");
    const { data } = parseMarkdownFrontmatter(systemRaw);
    const pages = Array.isArray((data as { pages?: unknown }).pages)
      ? (data as { pages: Array<Record<string, unknown>> }).pages
      : [];
    for (const page of pages) {
      if (typeof page.pageId === "string" && Array.isArray(page.locales)) {
        declaredLocales.set(page.pageId, page.locales.map(String));
      }
    }
  } catch {
    // No system.md → fall back to all-locale checking
  }
  return declaredLocales;
}

function compareSections(
  sourceSections: ContentSection[],
  targetSections: ContentSection[],
  sourceLocale: string,
  targetLocale: string,
  fileRel: string,
  sourceFile: string,
  targetFile: string,
  severity: "error" | "warning",
): ParityFinding[] {
  const findings: ParityFinding[] = [];

  // Section count mismatch — compare by position, not by heading slug
  // (translated headings produce different slugIds, so ID matching would
  // report all sections as missing even when the structure is identical)
  if (sourceSections.length !== targetSections.length) {
    const missingCount = sourceSections.length - targetSections.length;
    const missingSections = missingCount > 0 ? sourceSections.slice(targetSections.length) : [];
    const extraSections = missingCount < 0 ? targetSections.slice(sourceSections.length) : [];

    const missingItems: MissingItem[] = missingSections.map((s, i) => ({
      type: "section" as const,
      index: targetSections.length + i,
      heading: s.heading || undefined,
      sourceText: s.heading ? `## ${s.heading}\n\n${s.body}` : s.body,
    }));

    const missingHeadings = missingSections
      .map((s) => s.heading)
      .filter(Boolean)
      .map((h) => `'${h}'`);

    const message =
      missingCount > 0
        ? `${fileRel}: section count mismatch (${sourceLocale}=${sourceSections.length}, ${targetLocale}=${targetSections.length})`
        : `${fileRel}: target has ${extraSections.length} extra section(s) not in source`;

    const fixHint =
      missingCount > 0
        ? `Translate ${missingSections.length} missing section(s) from ${sourceLocale} to ${targetLocale}: ${missingHeadings.join(", ")}. Add them to the target file.`
        : `Remove ${extraSections.length} extra section(s) from ${targetLocale} file or add them to ${sourceLocale} file.`;

    findings.push({
      file: fileRel,
      sourceFile,
      targetFile,
      ruleId: "PARITY-SECTION-COUNT",
      sourceLocale,
      targetLocale,
      sourceCount: sourceSections.length,
      targetCount: targetSections.length,
      severity,
      message,
      fixHint,
      sourceExcerpt: missingSections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"),
      missingItems,
    });
    return findings;
  }

  // Sections match by count — compare paragraph/sentence counts per section by position
  for (let i = 0; i < sourceSections.length; i++) {
    const sourceSection = sourceSections[i];
    const targetSection = targetSections[i];

    const sourceParagraphs = extractParagraphs(sourceSection.body);
    const targetParagraphs = extractParagraphs(targetSection.body);

    if (sourceParagraphs.length !== targetParagraphs.length) {
      const missingParaCount = sourceParagraphs.length - targetParagraphs.length;
      const missingItems: MissingItem[] =
        missingParaCount > 0
          ? sourceParagraphs.slice(targetParagraphs.length).map((p, j) => ({
              type: "paragraph" as const,
              index: targetParagraphs.length + j,
              heading: sourceSection.heading || undefined,
              sourceText: p,
            }))
          : [];

      findings.push({
        file: fileRel,
        sourceFile,
        targetFile,
        ruleId: "PARITY-PARAGRAPH-COUNT",
        section: sourceSection.heading || undefined,
        sourceLocale,
        targetLocale,
        sourceCount: sourceParagraphs.length,
        targetCount: targetParagraphs.length,
        severity,
        message: `${fileRel}: paragraph count mismatch in section "${sourceSection.heading}" (${sourceLocale}=${sourceParagraphs.length}, ${targetLocale}=${targetParagraphs.length})`,
        fixHint:
          missingParaCount > 0
            ? `Add ${missingParaCount} missing paragraph(s) to section "${sourceSection.heading}" in ${targetLocale} locale.`
            : `Remove ${Math.abs(missingParaCount)} extra paragraph(s) from section "${sourceSection.heading}" in ${targetLocale} locale.`,
        sourceExcerpt:
          missingParaCount > 0
            ? sourceParagraphs.slice(targetParagraphs.length).join("\n\n")
            : undefined,
        missingItems,
      });
      continue;
    }

    // Paragraphs match — check sentence count per paragraph
    for (let p = 0; p < sourceParagraphs.length; p++) {
      const sourceSentences = splitSentences(sourceParagraphs[p], sourceLocale);
      const targetSentences = splitSentences(targetParagraphs[p], targetLocale);

      if (sourceSentences.length !== targetSentences.length) {
        const missingSentCount = sourceSentences.length - targetSentences.length;
        const missingItems: MissingItem[] =
          missingSentCount > 0
            ? sourceSentences.slice(targetSentences.length).map((s, j) => ({
                type: "sentence" as const,
                index: targetSentences.length + j,
                heading: sourceSection.heading || undefined,
                sourceText: s,
              }))
            : [];

        findings.push({
          file: fileRel,
          sourceFile,
          targetFile,
          ruleId: "PARITY-SENTENCE-COUNT",
          section: sourceSection.heading || undefined,
          sourceLocale,
          targetLocale,
          sourceCount: sourceSentences.length,
          targetCount: targetSentences.length,
          severity,
          message: `${fileRel}: sentence count mismatch in section "${sourceSection.heading}" paragraph ${p + 1} (${sourceLocale}=${sourceSentences.length}, ${targetLocale}=${targetSentences.length})`,
          fixHint:
            missingSentCount > 0
              ? `Add ${missingSentCount} missing sentence(s) to section "${sourceSection.heading}" paragraph ${p + 1} in ${targetLocale} locale.`
              : `Remove ${Math.abs(missingSentCount)} extra sentence(s) from section "${sourceSection.heading}" paragraph ${p + 1} in ${targetLocale} locale.`,
          sourceExcerpt:
            missingSentCount > 0
              ? sourceSentences.slice(targetSentences.length).join(" ")
              : undefined,
          missingItems,
        });
      }
    }
  }

  return findings;
}

async function collectAllFindings(
  contentDir: string,
  workpieceRoot: string,
  sourceLocale: string,
): Promise<{
  findings: ParityFinding[];
  knownFiles: Set<string>;
  knownSectionsByFile: Map<string, Set<string>>;
}> {
  const declaredLocales = await loadDeclaredLocales(contentDir);
  const findings: ParityFinding[] = [];
  const knownFiles = new Set<string>();
  const knownSectionsByFile = new Map<string, Set<string>>();

  for (const domain of CONTENT_DOMAINS) {
    const localeDirs = await getLocaleDirs(contentDir, domain);
    if (localeDirs.length < 2) continue;
    if (!localeDirs.includes(sourceLocale)) continue;

    const targetLocales = localeDirs.filter((l) => l !== sourceLocale);

    const sourceLangDir = join(contentDir, domain, sourceLocale);
    const sourceFiles = await collectMarkdownFiles(sourceLangDir);

    for (const sourceFile of sourceFiles) {
      const filename = sourceFile.split(/[\\/]/).pop() ?? "";
      const relInLang = relative(sourceLangDir, sourceFile).replace(/\\/g, "/");
      const fileRel = `${domain}/${relInLang}`;
      const severity: "error" | "warning" = isLegalDocument(filename) ? "error" : "warning";

      knownFiles.add(fileRel);
      const sectionsForFile = new Set<string>();
      knownSectionsByFile.set(fileRel, sectionsForFile);

      const sourceRaw = await readFile(sourceFile, "utf-8");
      const { data: sourceFm, content: sourceBody } = parseMarkdownFrontmatter(sourceRaw);

      let sourceSections: ContentSection[];
      if (domain === "pages") {
        sourceSections = extractPageSections(sourceFm);
      } else {
        sourceSections = extractProseSections(sourceBody);
      }

      for (const s of sourceSections) {
        if (s.heading) sectionsForFile.add(s.heading);
      }

      for (const targetLocale of targetLocales) {
        // Check locale scoping — skip if page is scoped to source locale only
        const pageId =
          typeof sourceFm.pageId === "string" ? sourceFm.pageId : relInLang.replace(/\.md$/i, "");
        const declared = declaredLocales.get(pageId);
        if (declared && !declared.includes(targetLocale)) continue;

        const targetFile = join(contentDir, domain, targetLocale, relInLang);
        let targetRaw: string;
        try {
          targetRaw = await readFile(targetFile, "utf-8");
        } catch {
          continue; // mirroring.validate catches missing files
        }

        const { data: targetFm, content: targetBody } = parseMarkdownFrontmatter(targetRaw);
        let targetSections: ContentSection[];
        if (domain === "pages") {
          targetSections = extractPageSections(targetFm);
        } else {
          targetSections = extractProseSections(targetBody);
        }

        const fileFindings = compareSections(
          sourceSections,
          targetSections,
          sourceLocale,
          targetLocale,
          fileRel,
          sourceFile,
          targetFile,
          severity,
        );
        findings.push(...fileFindings);
      }
    }
  }

  return { findings, knownFiles, knownSectionsByFile };
}

function findingsToDiagnostics(findings: ParityFinding[]): Diagnostic[] {
  return findings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    file: f.targetFile.replace(/\\/g, "/"),
    message: f.message,
    fixHint: f.fixHint,
  }));
}

// ---------------------------------------------------------------------------
// Command: translation.parity.validate
// ---------------------------------------------------------------------------

export async function runTranslationParityValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = paths.contentDirectory;
  const workpieceRoot = context.workspaceRoot;

  const { manifest } = await loadSystemManifestSafe(contentDir);
  const defaultLang = defaultLanguageFromManifest(manifest);
  const sourceLocale = getFlagString(input, "source-locale") ?? defaultLang;

  // Load suppressions
  let suppressions: SuppressionRecord[] = [];
  try {
    const supResult = await loadSuppressions(workpieceRoot);
    suppressions = supResult.records;
  } catch (err) {
    return failResult("translation.parity.validate", [String((err as Error).message ?? err)]);
  }

  // Check for duplicate suppressions
  const dupViolations = checkDuplicateSuppressions(suppressions);
  if (dupViolations.length > 0) {
    return failResult("translation.parity.validate", dupViolations);
  }

  // Collect all findings
  const { findings, knownFiles, knownSectionsByFile } = await collectAllFindings(
    contentDir,
    workpieceRoot,
    sourceLocale,
  );

  // Check for stale suppressions
  const staleViolations = checkStaleSuppressions(suppressions, knownFiles, knownSectionsByFile);
  const staleDiagnostics: Diagnostic[] = staleViolations.map((v) => ({
    ruleId: "PARITY-SUP-02",
    severity: "warning" as const,
    message: v,
  }));

  // Filter findings through suppressions
  const unsuppressed: ParityFinding[] = [];
  const suppressed: ParityFinding[] = [];
  for (const finding of findings) {
    if (isSuppressed(finding, suppressions)) {
      suppressed.push(finding);
    } else {
      unsuppressed.push(finding);
    }
  }

  const diagnostics = findingsToDiagnostics(unsuppressed);
  const allDiagnostics = [...diagnostics, ...staleDiagnostics];
  const filesChecked = new Set(findings.map((f) => f.file)).size;

  if (allDiagnostics.length === 0) {
    return {
      data: {
        command: "translation.parity.validate",
        status: "pass" as const,
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 0 },
        findings: [] as ParityFinding[],
        suppressed,
        paritySummary: {
          filesChecked,
          errors: 0,
          warnings: 0,
          suppressed: suppressed.length,
        },
      } as CheckResult & {
        findings: ParityFinding[];
        suppressed: ParityFinding[];
        paritySummary: {
          filesChecked: number;
          errors: number;
          warnings: number;
          suppressed: number;
        };
      },
      exitCode: 0,
      summary: `[translation.parity.validate] OK (${filesChecked} files checked, ${suppressed.length} suppressed)`,
    };
  }

  const result = diagnosticsResult("translation.parity.validate", allDiagnostics);
  return {
    ...result,
    data: {
      ...result.data,
      findings: unsuppressed,
      suppressed,
      paritySummary: {
        filesChecked,
        errors: diagnostics.filter((d) => d.severity === "error").length,
        warnings: diagnostics.filter((d) => d.severity === "warning").length,
        suppressed: suppressed.length,
      },
    } as CheckResult & {
      findings: ParityFinding[];
      suppressed: ParityFinding[];
      paritySummary: { filesChecked: number; errors: number; warnings: number; suppressed: number };
    },
  };
}

// ---------------------------------------------------------------------------
// Command: translation.parity.review
// ---------------------------------------------------------------------------

export async function runTranslationParityReview(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = paths.contentDirectory;
  const workpieceRoot = context.workspaceRoot;

  const { manifest } = await loadSystemManifestSafe(contentDir);
  const defaultLang = defaultLanguageFromManifest(manifest);
  const sourceLocale = getFlagString(input, "source-locale") ?? defaultLang;

  let suppressions: SuppressionRecord[] = [];
  try {
    suppressions = (await loadSuppressions(workpieceRoot)).records;
  } catch (err) {
    return failResult("translation.parity.review", [String((err as Error).message ?? err)]);
  }

  const { findings } = await collectAllFindings(contentDir, workpieceRoot, sourceLocale);

  const unsuppressed = findings.filter((f) => !isSuppressed(f, suppressions));

  const reviewManifest = {
    sourceLocale,
    generatedAt: new Date().toISOString(),
    findings: unsuppressed.map((f) => ({
      file: f.file,
      sourceFile: f.sourceFile,
      targetFile: f.targetFile,
      ruleId: f.ruleId,
      section: f.section,
      sourceLocale: f.sourceLocale,
      targetLocale: f.targetLocale,
      sourceCount: f.sourceCount,
      targetCount: f.targetCount,
      severity: f.severity,
      message: f.message,
      fixHint: f.fixHint,
      sourceExcerpt: f.sourceExcerpt,
      missingItems: f.missingItems,
    })),
  };

  const reviewPath = join(workpieceRoot, REVIEW_FILENAME);
  const reviewYaml = stringifyYaml(reviewManifest, { lineWidth: 0 });
  if (!context.dryRun) {
    await writeFileIfChanged(reviewPath, reviewYaml);
  }

  if (unsuppressed.length === 0) {
    return passResult(
      "translation.parity.review",
      `[translation.parity.review] No unsuppressed findings. Review manifest written to ${REVIEW_FILENAME}`,
    );
  }

  return {
    data: {
      command: "translation.parity.review",
      status: "warn" as const,
      diagnostics: [],
      summary: { error: 0, warning: unsuppressed.length, info: 0 },
      ...reviewManifest,
    } as CheckResult & typeof reviewManifest,
    exitCode: 0,
    summary: `[translation.parity.review] ${unsuppressed.length} unsuppressed finding(s). Manifest: ${REVIEW_FILENAME}`,
    nextSteps: [
      {
        action:
          "Review findings in translation-parity-review.yaml. Fix translations or run translation.parity.suppress for intentional differences.",
        kind: "required" as const,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Command: translation.parity.suppress
// ---------------------------------------------------------------------------

export async function runTranslationParitySuppress(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const workpieceRoot = context.workspaceRoot;
  const command = "translation.parity.suppress";

  const file = getFlagString(input, "file");
  const ruleId = getFlagString(input, "ruleId");
  const section = getFlagString(input, "section");
  const reason = getFlagString(input, "reason");

  if (!file) return failResult(command, ["--file <content-relative-path> is required"]);
  if (!ruleId) return failResult(command, ["--ruleId <PARITY-*> is required"]);
  if (!reason) return failResult(command, ["--reason <justification> is required"]);

  if (!PARITY_RULE_IDS.includes(ruleId as (typeof PARITY_RULE_IDS)[number])) {
    return failResult(command, [`--ruleId must be one of: ${PARITY_RULE_IDS.join(", ")}`]);
  }

  // Load existing suppressions
  let existing: SuppressionRecord[] = [];
  try {
    existing = (await loadSuppressions(workpieceRoot)).records;
  } catch (err) {
    return failResult(command, [String((err as Error).message ?? err)]);
  }

  // Check for duplicates
  const newRecord: SuppressionRecord = {
    file,
    ruleId,
    ...(section ? { section } : {}),
    reason,
    approvedAt: new Date().toISOString().slice(0, 10),
  };

  const dupKey = `${newRecord.file}|${newRecord.ruleId}|${newRecord.section ?? ""}`;
  const existingKeys = new Set(existing.map((s) => `${s.file}|${s.ruleId}|${s.section ?? ""}`));
  if (existingKeys.has(dupKey)) {
    return failResult(command, [`PARITY-SUP-03: Suppression already exists for ${dupKey}`]);
  }

  const updated = [...existing, newRecord];
  const yamlContent = stringifyYaml({ suppressions: updated }, { lineWidth: 0 });

  const supPath = join(workpieceRoot, SUPPRESSIONS_FILENAME);
  if (!context.dryRun) {
    await writeFileIfChanged(supPath, yamlContent);
  }

  return {
    data: {
      command,
      status: "pass" as const,
      diagnostics: [],
      summary: { error: 0, warning: 0, info: 0 },
    },
    exitCode: 0,
    summary: `[translation.parity.suppress] Added suppression for ${file} (${ruleId}${section ? `, section: ${section}` : ""}). Total: ${updated.length} record(s).`,
    nextSteps: [
      {
        action: "Re-run translation.parity.validate to confirm the finding is now suppressed.",
        kind: "required" as const,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Safe system manifest loader
// ---------------------------------------------------------------------------

async function loadSystemManifestSafe(
  contentDir: string,
): Promise<{ manifest: { i18n?: { default?: string } } }> {
  try {
    return await loadSystemManifest(contentDir);
  } catch {
    return { manifest: { i18n: { default: "de" } } };
  }
}
