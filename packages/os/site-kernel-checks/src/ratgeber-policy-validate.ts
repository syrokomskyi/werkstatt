/*
<MODULE_CONTRACT>
<purpose>
RFC-0503: ratgeber.policy.validate — validate ratgeber editorial policy page
existence, required H2 sections, review cadence, and article status workflow.
Checks that the editorial policy page exists in all supported languages with
all 5 required sections, published articles are not stale (reviewedAt > 3 months
warning), published articles pass basic field checks, and no review-required
article appears in the surface artifact.
Diagnostics: RG-POL-01..05.
</purpose>
<non-goals>
  <item>Do not validate article structure — that is ratgeber.article.validate (RFC-0501).</item>
  <item>Do not validate hub layout — that is ratgeber.hub.validate (RFC-0500).</item>
  <item>Do not validate provenance — that is ratgeber.provenance.validate (RFC-0502).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0503: initial policy validator with 5 rules (RG-POL-01..05).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import {
  loadSystemManifest,
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
} from "@gogol/site-kernel-content";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { ARTIFACT_FILE, readLangs } from "./surface/shared.ts";

const REQUIRED_SECTIONS_DE = [
  "## Redaktionsstandards",
  "## Prüfrhythmus",
  "## Autoren",
  "## Quellenpolitik",
  "## Kontakt",
];

const REQUIRED_SECTIONS_UK = [
  "## Редакційні стандарти",
  "## Ритм перевірки",
  "## Автори",
  "## Політика джерел",
  "## Контакти",
];

const REVIEW_CADENCE_MONTHS = 3;
const REVIEW_CADENCE_MS = REVIEW_CADENCE_MONTHS * 30 * 24 * 60 * 60 * 1000;

const REQUIRED_PUBLISHED_FIELDS = ["question", "summary", "readTime", "reviewedAt", "authorId"];

function getRequiredSections(lang: string): string[] {
  return lang === "uk" ? REQUIRED_SECTIONS_UK : REQUIRED_SECTIONS_DE;
}

function extractH2Headings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    const match = /^(##\s+.+)$/.exec(trimmed);
    if (match) {
      headings.push(match[1].trim());
    }
  }
  return headings;
}

interface ArticleRecord {
  slug: string;
  lang: string;
  filePath: string;
  status: string;
  reviewedAt: string | undefined;
}

async function loadArticleRecords(appDir: string): Promise<ArticleRecord[]> {
  const records: ArticleRecord[] = [];
  const articlesBaseDir = join(appDir, "src", "content", "surface", "articles");

  let langDirs: string[];
  try {
    langDirs = await readdir(articlesBaseDir);
  } catch {
    return records;
  }

  for (const lang of langDirs) {
    const langDir = join(articlesBaseDir, lang);
    const files = await collectMarkdownFiles(langDir).catch(() => []);
    for (const file of files) {
      const raw = await readFile(file, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const slug = file.split("/").pop()?.replace(/\.md$/, "") ?? "";
      records.push({
        slug,
        lang,
        filePath: file,
        status: typeof data?.status === "string" ? data.status : "draft",
        reviewedAt: typeof data?.reviewedAt === "string" ? data.reviewedAt : undefined,
      });
    }
  }

  return records;
}

export async function runRatgeberPolicyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "ratgeber.policy.validate";
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const contentDir = join(appDir, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const _defaultLang = defaultLanguageFromManifest(manifest);
  const { supportedLangs } = await readLangs(appDir);

  const diagnostics: Diagnostic[] = [];

  const proseBaseDir = join(appDir, "src", "content", "prose");

  for (const lang of supportedLangs) {
    const prosePath = join(proseBaseDir, lang, "ratgeber-redaktion.md");

    // RG-POL-01: Editorial policy page does not exist
    if (!existsSync(prosePath)) {
      diagnostics.push({
        ruleId: "RG-POL-01",
        severity: "error",
        file: `src/content/prose/${lang}/ratgeber-redaktion.md`,
        message: `Editorial policy page does not exist for language "${lang}"`,
        fixHint: `Create src/content/prose/${lang}/ratgeber-redaktion.md with the required H2 sections.`,
        data: { lang },
      });
      continue;
    }

    const raw = await readFile(prosePath, "utf-8");
    const headings = extractH2Headings(raw);
    const required = getRequiredSections(lang);

    // RG-POL-02: Policy page missing a required section
    for (const section of required) {
      if (!headings.includes(section)) {
        diagnostics.push({
          ruleId: "RG-POL-02",
          severity: "error",
          file: `src/content/prose/${lang}/ratgeber-redaktion.md`,
          message: `Policy page missing required section "${section}"`,
          fixHint: `Add an H2 heading "${section}" to the policy page.`,
          data: { lang, section },
        });
      }
    }
  }

  // Load articles for RG-POL-03, RG-POL-04
  const records = await loadArticleRecords(appDir);
  const now = Date.now();

  for (const record of records) {
    // RG-POL-03: Published article reviewedAt older than 3 months (warning)
    if (record.status === "published" && record.reviewedAt) {
      const reviewedDate = new Date(record.reviewedAt).getTime();
      if (!Number.isNaN(reviewedDate) && now - reviewedDate > REVIEW_CADENCE_MS) {
        diagnostics.push({
          ruleId: "RG-POL-03",
          severity: "warning",
          file: record.filePath,
          message: `article "${record.slug}" (lang: ${record.lang}) reviewedAt is older than ${REVIEW_CADENCE_MONTHS} months`,
          fixHint: `Review the article and update reviewedAt, or move status to review-required.`,
          data: { slug: record.slug, lang: record.lang, reviewedAt: record.reviewedAt },
        });
      }
    }

    // RG-POL-04: Published article missing required fields
    if (record.status === "published") {
      const raw = await readFile(record.filePath, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      for (const field of REQUIRED_PUBLISHED_FIELDS) {
        const value = data?.[field];
        if (value === undefined || value === null || value === "") {
          diagnostics.push({
            ruleId: "RG-POL-04",
            severity: "error",
            file: record.filePath,
            message: `published article "${record.slug}" (lang: ${record.lang}) is missing required field "${field}"`,
            fixHint: `Add the "${field}" field to the article frontmatter or move status to draft/review-required.`,
            data: { slug: record.slug, lang: record.lang, field },
          });
        }
      }
    }
  }

  // RG-POL-05: Article with status: review-required appears in surface artifact
  const artifactPath = join(appDir, ARTIFACT_FILE);
  if (existsSync(artifactPath)) {
    try {
      const artifactRaw = await readFile(artifactPath, "utf8");
      const artifact = yamlParse(artifactRaw) as { entries?: unknown[] };
      const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
      const ratgeberEntries = entries.filter(
        (e) =>
          typeof e === "object" &&
          e !== null &&
          (e as Record<string, unknown>).surfaceId === "ratgeber",
      );
      const reviewRequiredSlugs = new Set(
        records.filter((r) => r.status === "review-required").map((r) => r.slug),
      );
      for (const entry of ratgeberEntries) {
        const e = entry as Record<string, unknown>;
        const axes = e.axes as Record<string, unknown> | undefined;
        const articleSlug = axes?.["article"];
        if (typeof articleSlug === "string" && reviewRequiredSlugs.has(articleSlug)) {
          diagnostics.push({
            ruleId: "RG-POL-05",
            severity: "error",
            file: ARTIFACT_FILE,
            message: `article "${articleSlug}" with status: review-required appears in surface artifact`,
            fixHint: `Ensure the statusGate excludes review-required articles from the surface artifact.`,
            data: { slug: articleSlug },
          });
        }
      }
    } catch {
      // Artifact not readable — skip RG-POL-05
    }
  }

  if (diagnostics.length === 0) {
    return passResult(command, "ratgeber.policy.validate: OK — all checks passed");
  }

  return diagnosticsResult(command, diagnostics);
}
