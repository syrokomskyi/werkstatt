/*
<MODULE_CONTRACT>
<purpose>
[RFC-0501] ratgeber.article.validate — validate ratgeber article types, mandatory 10-section
prose structure, type-specific requirements, and publication gate. Reads article records
from src/content/surface/articles/{lang}/*.md and prose bodies from
src/content/prose/{lang}/ratgeber-{slug}.md. Enforces RG-ART-01..10.
[RFC-0504] adds RG-ART-07 (no H1 in prose body), RG-ART-08 (articleSections valid slots),
RG-ART-09 (changelog entry schema + authorId resolution), RG-ART-10 (secondaryCta.target valid).
</purpose>
<non-goals>
  <item>Do not validate the hub layout — that is ratgeber.hub.validate (RFC-0500).</item>
  <item>Do not validate generic article depth (dates, feed, twin) — that is article.depth.validate (RFC-0325).</item>
  <item>Do not auto-generate or rewrite prose bodies — read-only check.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0501: initial implementation — ratgeber article validator with 6 rules (RG-ART-01..06).</item>
  <item>RFC-0504: add RG-ART-07..10 — H1 prohibition, articleSections schema, changelog schema, secondaryCta validation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import {
  loadSystemManifest,
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
} from "@warpgogol/site-kernel-content";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { countWords } from "./article-depth.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

const WORD_FLOOR = 500;

const ARTICLE_TYPES = [
  "grundlagenartikel",
  "entscheidungshilfe",
  "checkliste",
  "vergleich",
  "rechenmodell",
  "methodik",
  "begriffserklaerung",
] as const;

type ArticleType = (typeof ARTICLE_TYPES)[number];

const VALID_SECTION_SLOTS = [
  "direct-answer",
  "definitions",
  "analysis",
  "example",
  "checklist",
  "limitations",
  "sources",
  "warpgogol-connection",
] as const;

const MANDATORY_SECTIONS_DE = [
  "## Einleitung",
  "## Kernfrage",
  "## Wissensbasis",
  "## Praxisbezug",
  "## Häufige Missverständnisse",
  "## Kosten und Trade-offs",
  "## Checkliste",
  "## FAQ",
  "## Zusammenfassung",
  "## Quellen",
];

const MANDATORY_SECTIONS_UK = [
  "## Вступ",
  "## Ключове питання",
  "## База знань",
  "## Практична частина",
  "## Поширені помилки",
  "## Витрати і компроміси",
  "## Контрольний список",
  "## Поширені запитання",
  "## Підсумок",
  "## Джерела",
];

const SECTION_LISTS: Record<string, string[]> = {
  de: MANDATORY_SECTIONS_DE,
  uk: MANDATORY_SECTIONS_UK,
};

interface ArticleRecord {
  slug: string;
  lang: string;
  filePath: string;
  data: Record<string, unknown>;
  status: string;
  articleType: string | undefined;
}

function getMandatorySections(lang: string): string[] | undefined {
  return SECTION_LISTS[lang];
}

function extractH2Headings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^##\s+(.+)$/.exec(line.trim());
    if (match) {
      headings.push(`## ${match[1]!.trim()}`);
    }
  }
  return headings;
}

function getSectionContent(markdown: string, sectionHeading: string): string {
  const lines = markdown.split("\n");
  const content: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isH2 = /^##\s+/.test(trimmed);
    if (isH2) {
      if (inSection) break;
      if (`## ${trimmed.replace(/^##\s+/, "").trim()}` === sectionHeading) {
        inSection = true;
      }
    } else if (inSection) {
      content.push(line);
    }
  }
  return content.join("\n");
}

function countTableDataRows(content: string): number {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return 0;
  // Skip header row and separator row(s)
  let dataRows = 0;
  let pastSeparator = false;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^\|[\s:|-]+\|$/.test(trimmed)) {
      pastSeparator = true;
      continue;
    }
    if (pastSeparator || i > 1) {
      dataRows++;
    }
  }
  return dataRows;
}

function countTableColumns(content: string): number {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length === 0) return 0;
  const firstRow = lines[0]!.trim();
  return firstRow.split("|").filter((c) => c.trim()).length;
}

function countChecklistItems(content: string): number {
  return content.split("\n").filter((l) => /^-\s+\[[ xX]\]/.test(l.trim())).length;
}

function countNumberedSteps(content: string): number {
  return content.split("\n").filter((l) => /^\d+\.\s/.test(l.trim())).length;
}

function hasCalculationExample(content: string): boolean {
  return /\d+[.,]?\d*\s*[€$]?/.test(content);
}

function hasBoldDefinition(content: string): boolean {
  const lines = content.split("\n");
  for (const line of lines) {
    const match = /\*\*([^*]+)\*\*/.exec(line);
    if (match) {
      const boldText = match[1]!;
      // Single sentence: no period within the bold text (period at end is ok)
      if (
        !boldText.includes(".") ||
        (boldText.endsWith(".") && !boldText.slice(0, -1).includes("."))
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasH1OutsideCodeBlocks(markdown: string): boolean {
  let inFencedCode = false;
  let inHtmlComment = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFencedCode = !inFencedCode;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      inHtmlComment = true;
    }
    if (trimmed.includes("-->")) {
      inHtmlComment = false;
      continue;
    }
    if (inFencedCode || inHtmlComment) continue;
    if (/^#\s+/.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function checkTypeSpecificRequirement(articleType: string, proseContent: string): string | null {
  switch (articleType as ArticleType) {
    case "grundlagenartikel": {
      const sectionContent =
        getSectionContent(proseContent, "## Wissensbasis") ||
        getSectionContent(proseContent, "## База знань");
      if (countWords(sectionContent) < 200) {
        return "Wissensbasis section must be ≥ 200 words";
      }
      return null;
    }
    case "entscheidungshilfe": {
      const sectionContent =
        getSectionContent(proseContent, "## Kernfrage") ||
        getSectionContent(proseContent, "## Ключове питання");
      if (countTableDataRows(sectionContent) < 3) {
        return "Kernfrage section must contain a decision table with ≥ 3 data rows";
      }
      return null;
    }
    case "checkliste": {
      const sectionContent =
        getSectionContent(proseContent, "## Checkliste") ||
        getSectionContent(proseContent, "## Контрольний список");
      if (countChecklistItems(sectionContent) < 5) {
        return "Checkliste section must contain ≥ 5 checklist items (- [ ] or - [x])";
      }
      return null;
    }
    case "vergleich": {
      const sectionContent =
        getSectionContent(proseContent, "## Praxisbezug") ||
        getSectionContent(proseContent, "## Практична частина");
      if (countTableColumns(sectionContent) < 2 || countTableDataRows(sectionContent) < 3) {
        return "Praxisbezug section must contain a comparison table with ≥ 2 columns and ≥ 3 data rows";
      }
      return null;
    }
    case "rechenmodell": {
      const sectionContent =
        getSectionContent(proseContent, "## Kosten und Trade-offs") ||
        getSectionContent(proseContent, "## Витрати і компроміси");
      if (!hasCalculationExample(sectionContent)) {
        return "Kosten section must contain a calculation example with explicit numbers";
      }
      return null;
    }
    case "methodik": {
      const sectionContent =
        getSectionContent(proseContent, "## Praxisbezug") ||
        getSectionContent(proseContent, "## Практична частина");
      if (countNumberedSteps(sectionContent) < 3) {
        return "Praxisbezug section must contain a numbered step-by-step guide with ≥ 3 steps";
      }
      return null;
    }
    case "begriffserklaerung": {
      const sectionContent =
        getSectionContent(proseContent, "## Kernfrage") ||
        getSectionContent(proseContent, "## Ключове питання");
      if (!hasBoldDefinition(sectionContent)) {
        return "Kernfrage section must contain a one-sentence definition in bold";
      }
      return null;
    }
    default:
      return null;
  }
}

async function loadArticleRecords(appDir: string, _defaultLang: string): Promise<ArticleRecord[]> {
  const records: ArticleRecord[] = [];
  const articlesBaseDir = join(appDir, "src", "content", "surface", "articles");

  const langDirs: string[] = [];
  try {
    const entries = await readdir(articlesBaseDir);
    for (const entry of entries) {
      const stat = await readdir(join(articlesBaseDir, entry)).catch(() => []);
      if (stat.length > 0) langDirs.push(entry);
    }
  } catch {
    return [];
  }

  for (const lang of langDirs) {
    const langDir = join(articlesBaseDir, lang);
    const files = await collectMarkdownFiles(langDir).catch(() => []);
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const { data } = parseMarkdownFrontmatter(raw);
      const slug = file.split("/").pop()?.replace(/\.md$/, "") ?? "";
      records.push({
        slug,
        lang,
        filePath: file,
        data: data as Record<string, unknown>,
        status: typeof data?.status === "string" ? data.status : "draft",
        articleType: typeof data?.articleType === "string" ? data.articleType : undefined,
      });
    }
  }

  return records;
}

function resolveProsePath(appDir: string, lang: string, slug: string): string {
  const proseSlug = `ratgeber-${slug}`;
  return join(appDir, "src", "content", "prose", lang, `${proseSlug}.md`);
}

export async function runRatgeberArticleValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const contentDir = join(appDir, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const defaultLang = defaultLanguageFromManifest(manifest);

  const records = await loadArticleRecords(appDir, defaultLang);
  if (records.length === 0) {
    return passResult(
      "ratgeber.article.validate",
      "ratgeber.article.validate: OK — no ratgeber articles found",
    );
  }

  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const { slug, lang, status, articleType } = record;
    const articleId = `articles/${lang}/${slug}`;

    // RG-ART-01: Article type must be one of the seven allowed types
    if (!articleType) {
      diagnostics.push({
        ruleId: "RG-ART-01",
        severity: "error",
        file: record.filePath,
        message: `article "${articleId}" has no articleType — must be one of: ${ARTICLE_TYPES.join(", ")}`,
        fixHint: `Add an articleType field to the article frontmatter (one of: ${ARTICLE_TYPES.join(", ")}).`,
        data: { slug, lang },
      });
      continue;
    }
    if (!ARTICLE_TYPES.includes(articleType as ArticleType)) {
      diagnostics.push({
        ruleId: "RG-ART-01",
        severity: "error",
        file: record.filePath,
        message: `article "${articleId}" has invalid articleType "${articleType}" — must be one of: ${ARTICLE_TYPES.join(", ")}`,
        fixHint: `Set articleType to one of: ${ARTICLE_TYPES.join(", ")}.`,
        data: { slug, lang, articleType },
      });
      continue;
    }

    // Load prose body
    const prosePath = resolveProsePath(appDir, lang, slug);
    if (!existsSync(prosePath)) {
      diagnostics.push({
        ruleId: "RG-ART-03",
        severity: "error",
        file: prosePath,
        message: `article "${articleId}" has no prose body at ${prosePath}`,
        fixHint: `Create the prose file at src/content/prose/${lang}/ratgeber-${slug}.md with the mandatory 10-section structure.`,
        data: { slug, lang },
      });
      continue;
    }
    const proseContent = await readFile(prosePath, "utf8");

    // RG-ART-07: No H1 headings in prose body (RFC-0504)
    if (hasH1OutsideCodeBlocks(proseContent)) {
      diagnostics.push({
        ruleId: "RG-ART-07",
        severity: "error",
        file: prosePath,
        message: `article "${articleId}" prose body contains H1 headings — H1 is reserved for the article-header block`,
        fixHint: `Convert H1 headings (# ) to H2 (## ) or remove them. The article title is rendered as H1 by the article-header block only.`,
        data: { slug, lang },
      });
    }

    // RG-ART-08: articleSections entries must be from the valid set (RFC-0504)
    const articleSectionsRaw = record.data?.articleSections;
    if (Array.isArray(articleSectionsRaw)) {
      const invalidSlots = articleSectionsRaw.filter(
        (s) =>
          typeof s !== "string" ||
          !VALID_SECTION_SLOTS.includes(s as (typeof VALID_SECTION_SLOTS)[number]),
      );
      if (invalidSlots.length > 0) {
        diagnostics.push({
          ruleId: "RG-ART-08",
          severity: "error",
          file: record.filePath,
          message: `article "${articleId}" has invalid articleSections slot(s): ${invalidSlots.join(", ")} — valid slots: ${VALID_SECTION_SLOTS.join(", ")}`,
          fixHint: `Remove or correct the invalid slot name(s) in the articleSections frontmatter field.`,
          data: { slug, lang, invalidSlots },
        });
      }
    }

    // RG-ART-09: changelog entries must have date, summary, authorId (RFC-0504)
    const changelogRaw = record.data?.changelog;
    if (Array.isArray(changelogRaw)) {
      for (let i = 0; i < changelogRaw.length; i++) {
        const entry = changelogRaw[i];
        if (typeof entry !== "object" || entry === null) {
          diagnostics.push({
            ruleId: "RG-ART-09",
            severity: "error",
            file: record.filePath,
            message: `article "${articleId}" changelog entry ${i} is not an object`,
            fixHint: `Each changelog entry must be an object with date, summary, and authorId fields.`,
            data: { slug, lang, entryIndex: i },
          });
          continue;
        }
        const e = entry as Record<string, unknown>;
        const missing: string[] = [];
        if (typeof e.date !== "string") missing.push("date");
        if (typeof e.summary !== "string") missing.push("summary");
        if (typeof e.authorId !== "string") missing.push("authorId");
        if (missing.length > 0) {
          diagnostics.push({
            ruleId: "RG-ART-09",
            severity: "error",
            file: record.filePath,
            message: `article "${articleId}" changelog entry ${i} is missing field(s): ${missing.join(", ")}`,
            fixHint: `Add the missing field(s) to the changelog entry. Each entry needs date (YYYY-MM-DD), summary, and authorId.`,
            data: { slug, lang, entryIndex: i, missing },
          });
        }
      }
    }

    // RG-ART-10: secondaryCta.target must be a valid internal URL or anchor (RFC-0504)
    const secondaryCtaRaw = record.data?.secondaryCta;
    if (typeof secondaryCtaRaw === "object" && secondaryCtaRaw !== null) {
      const cta = secondaryCtaRaw as Record<string, unknown>;
      const target = cta.target;
      if (typeof target !== "string" || (!target.startsWith("/") && !target.startsWith("#"))) {
        diagnostics.push({
          ruleId: "RG-ART-10",
          severity: "error",
          file: record.filePath,
          message: `article "${articleId}" has invalid secondaryCta.target "${String(target)}" — must be an internal URL (starting with /) or anchor (starting with #)`,
          fixHint: `Set secondaryCta.target to an internal path (e.g. /leistungen/) or anchor (e.g. #checklist).`,
          data: { slug, lang, target: String(target) },
        });
      }
    }

    // Check if this language has a defined section list
    const mandatorySections = getMandatorySections(lang);

    // For published articles, enforce the full gate
    if (status === "published") {
      // RG-ART-02: Word count floor
      const wordCount = countWords(proseContent);
      if (wordCount < WORD_FLOOR) {
        diagnostics.push({
          ruleId: "RG-ART-02",
          severity: "error",
          file: prosePath,
          message: `article "${articleId}" has ${wordCount} words, below the ${WORD_FLOOR}-word floor`,
          fixHint: `Expand the prose body to at least ${WORD_FLOOR} words.`,
          data: { slug, lang, wordCount },
        });
      }

      if (mandatorySections) {
        // RG-ART-03: All mandatory section headings present
        const headings = extractH2Headings(proseContent);
        const missingSections = mandatorySections.filter((s) => !headings.includes(s));
        if (missingSections.length > 0) {
          diagnostics.push({
            ruleId: "RG-ART-03",
            severity: "error",
            file: prosePath,
            message: `article "${articleId}" is missing mandatory section(s): ${missingSections.join(", ")}`,
            fixHint: `Add the missing H2 section heading(s) to the prose body.`,
            data: { slug, lang, missingSections },
          });
        }

        // RG-ART-04: Section headings in order
        const orderedPresent = mandatorySections.filter((s) => headings.includes(s));
        const isOrdered = orderedPresent.every(
          (s, i) =>
            headings[headings.indexOf(s)] === s &&
            (i === 0 || headings.indexOf(orderedPresent[i - 1]!) < headings.indexOf(s)),
        );
        if (!isOrdered && missingSections.length === 0) {
          diagnostics.push({
            ruleId: "RG-ART-04",
            severity: "error",
            file: prosePath,
            message: `article "${articleId}" has section headings out of order — expected: ${mandatorySections.join(", ")}`,
            fixHint: `Reorder the H2 section headings to match the mandatory order.`,
            data: { slug, lang },
          });
        }
      } else {
        // RG-ART-06: Language without a defined section list
        diagnostics.push({
          ruleId: "RG-ART-06",
          severity: "warning",
          file: prosePath,
          message: `article "${articleId}" is in language "${lang}" which has no defined mandatory section list — section structure check skipped`,
          fixHint: `Add a section list for this language in a follow-up RFC.`,
          data: { slug, lang },
        });
      }

      // RG-ART-05: Type-specific requirement
      const typeError = checkTypeSpecificRequirement(articleType, proseContent);
      if (typeError) {
        diagnostics.push({
          ruleId: "RG-ART-05",
          severity: "error",
          file: prosePath,
          message: `article "${articleId}" (type: ${articleType}): ${typeError}`,
          fixHint: `Add the required content to the specified section.`,
          data: { slug, lang, articleType },
        });
      }
    } else {
      // RG-ART-06: Draft/review-required articles — advisory check
      if (mandatorySections) {
        const headings = extractH2Headings(proseContent);
        const missingSections = mandatorySections.filter((s) => !headings.includes(s));
        if (missingSections.length > 0) {
          diagnostics.push({
            ruleId: "RG-ART-06",
            severity: "warning",
            file: prosePath,
            message: `article "${articleId}" (status: ${status}) is missing section(s): ${missingSections.join(", ")} — non-blocking until published`,
            fixHint: `Add the missing H2 section heading(s) before setting status to published.`,
            data: { slug, lang, missingSections },
          });
        }
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "ratgeber.article.validate",
      `ratgeber.article.validate: OK — ${records.length} article(s) conform`,
    );
  }

  return diagnosticsResult("ratgeber.article.validate", diagnostics);
}
