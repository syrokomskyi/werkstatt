/*
<MODULE_CONTRACT>
<purpose>
RFC-0502: ratgeber.provenance.validate — validate ratgeber editorial provenance:
author IDs, source IDs, claim IDs, and Quellen section coverage. Checks that
every article's authorId resolves to an author record, every sourceId resolves
to a source descriptor, every claimId exists in the claim record collection
(RFC-0505: updated from claim sidecars to surface/claims/), and every sourceId
appears in the prose body's Quellen section.
RFC-0505: RG-PROV-03 now resolves claimIds against surface/claims/{lang}/*.md
claim records instead of article claim sidecars. RG-PROV-06 added: every
claimId in sources[].claimIds resolves to a claim record.
Diagnostics: RG-PROV-01..06.
</purpose>
<non-goals>
  <item>Do not validate article structure — that is ratgeber.article.validate (RFC-0501).</item>
  <item>Do not validate hub layout — that is ratgeber.hub.validate (RFC-0500).</item>
  <item>Do not check source descriptor reachability — that is CKL-SRC-04 in source.binding.validate.</item>
  <item>Do not validate claim record schema — that is ratgeber.claim.validate (RFC-0505).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0502: initial provenance validator with 5 rules (RG-PROV-01..05).</item>
  <item>RFC-0505: RG-PROV-03 resolves against claim records (surface/claims/) instead of sidecars. Add RG-PROV-06 (article claimIds resolve to claim records).</item>
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
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  loadSystemManifest,
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSourceDescriptors } from "./content-source-binding.ts";
import { loadClaimRecords } from "./lib/surface-claims.ts";

const EXEMPT_TYPES = new Set(["grundlagenartikel", "begriffserklaerung"]);

interface AuthorRecord {
  id: string;
  name: string;
  role: string;
  bio: string;
  contactUrl?: string;
}

interface ArticleSourceBinding {
  sourceId: string;
  claimIds: string[];
}

interface ArticleRecord {
  slug: string;
  lang: string;
  filePath: string;
  data: Record<string, unknown>;
  status: string;
  articleType: string | undefined;
  authorId: string | undefined;
  sources: ArticleSourceBinding[];
}

async function loadAuthorRecords(appDir: string): Promise<Map<string, AuthorRecord>> {
  const byId = new Map<string, AuthorRecord>();
  const authorsBaseDir = join(appDir, "src", "content", "surface", "authors");

  let langDirs: string[];
  try {
    langDirs = await readdir(authorsBaseDir);
  } catch {
    return byId;
  }

  for (const langDir of langDirs) {
    const langPath = join(authorsBaseDir, langDir);
    const stat = await readdir(langPath).catch(() => []);
    if (stat.length === 0) continue;

    const files = await collectMarkdownFiles(langPath).catch(() => []);
    for (const file of files) {
      const raw = await readFile(file, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const id = typeof data?.id === "string" ? data.id : "";
      if (!id) continue;
      byId.set(id, {
        id,
        name: typeof data?.name === "string" ? data.name : "",
        role: typeof data?.role === "string" ? data.role : "",
        bio: typeof data?.bio === "string" ? data.bio : "",
        contactUrl: typeof data?.contactUrl === "string" ? data.contactUrl : undefined,
      });
    }
  }

  return byId;
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

      const sourcesRaw = Array.isArray(data?.sources) ? data.sources : [];
      const sources: ArticleSourceBinding[] = sourcesRaw
        .filter((s: unknown) => typeof s === "object" && s !== null)
        .map((s: unknown) => {
          const obj = s as Record<string, unknown>;
          return {
            sourceId: typeof obj.sourceId === "string" ? obj.sourceId : "",
            claimIds: Array.isArray(obj.claimIds)
              ? (obj.claimIds.filter((c: unknown) => typeof c === "string") as string[])
              : [],
          };
        });

      records.push({
        slug,
        lang,
        filePath: file,
        data: data as Record<string, unknown>,
        status: typeof data?.status === "string" ? data.status : "draft",
        articleType: typeof data?.articleType === "string" ? data.articleType : undefined,
        authorId: typeof data?.authorId === "string" ? data.authorId : undefined,
        sources,
      });
    }
  }

  return records;
}

function resolveProsePath(appDir: string, lang: string, slug: string): string {
  const proseSlug = `ratgeber-${slug}`;
  return join(appDir, "src", "content", "prose", lang, `${proseSlug}.md`);
}

function getQuellenSectionContent(markdown: string): string {
  const lines = markdown.split("\n");
  const content: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isH2 = /^##\s+/.test(trimmed);
    if (isH2) {
      if (inSection) break;
      const heading = trimmed.replace(/^##\s+/, "").trim();
      if (heading === "Quellen" || heading === "Джерела") {
        inSection = true;
      }
    } else if (inSection) {
      content.push(line);
    }
  }
  return content.join("\n");
}

export async function runRatgeberProvenanceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "ratgeber.provenance.validate";
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const contentDir = join(appDir, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const _defaultLang = defaultLanguageFromManifest(manifest);

  const records = await loadArticleRecords(appDir);
  if (records.length === 0) {
    return passResult(
      "ratgeber.provenance.validate",
      "ratgeber.provenance.validate: OK — no ratgeber articles found",
    );
  }

  const authors = await loadAuthorRecords(appDir);
  const { byId: sourceDescriptors } = await loadSourceDescriptors(context.workspaceRoot);
  const { byId: claimRecords } = await loadClaimRecords(appDir);

  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const { slug, lang, status, articleType, authorId, sources, filePath } = record;
    const articleId = `articles/${lang}/${slug}`;

    // RG-PROV-01: authorId must resolve to an author record
    if (status === "published") {
      if (!authorId) {
        diagnostics.push({
          ruleId: "RG-PROV-01",
          severity: "error",
          file: filePath,
          message: `article "${articleId}" has no authorId — must reference an author record`,
          fixHint:
            "Add an authorId field to the article frontmatter that matches an author record id.",
          data: { slug, lang },
        });
      } else if (!authors.has(authorId)) {
        diagnostics.push({
          ruleId: "RG-PROV-01",
          severity: "error",
          file: filePath,
          message: `article "${articleId}" authorId "${authorId}" does not resolve to an author record`,
          fixHint: `Create surface/authors/${lang}/${authorId}.md or fix the authorId.`,
          data: { slug, lang, authorId },
        });
      }
    }

    // RG-PROV-05: article with no sources (warning for non-exempt types)
    if (status === "published" && sources.length === 0) {
      if (articleType && !EXEMPT_TYPES.has(articleType)) {
        diagnostics.push({
          ruleId: "RG-PROV-05",
          severity: "warning",
          file: filePath,
          message: `article "${articleId}" (type: ${articleType}) has no sources — non-exempt types require at least one source`,
          fixHint: `Add a sources entry with a sourceId and claimIds, or change articleType to an exempt type (grundlagenartikel, begriffserklaerung).`,
          data: { slug, lang, articleType },
        });
      }
    }

    // RG-PROV-02: sourceId must resolve to a source descriptor
    for (const source of sources) {
      if (!source.sourceId) continue;
      if (!sourceDescriptors.has(source.sourceId)) {
        diagnostics.push({
          ruleId: "RG-PROV-02",
          severity: "error",
          file: filePath,
          message: `article "${articleId}" sourceId "${source.sourceId}" does not resolve to a source descriptor`,
          fixHint: `Add integrations/truth-sources/${source.sourceId}.yaml or fix the sourceId.`,
          data: { slug, lang, sourceId: source.sourceId },
        });
      }
    }

    // RG-PROV-03 + RG-PROV-06 (RFC-0505): claimId must exist in the claim record collection
    // (surface/claims/{lang}/*.md). RG-PROV-03 checks claimId existence; RG-PROV-06 checks
    // that article sources[].claimIds resolve to claim records.
    if (sources.some((s) => s.claimIds.length > 0)) {
      for (const source of sources) {
        for (const claimId of source.claimIds) {
          if (!claimRecords.has(claimId)) {
            diagnostics.push({
              ruleId: "RG-PROV-03",
              severity: "error",
              file: filePath,
              message: `article "${articleId}" claimId "${claimId}" not found in claim record collection`,
              fixHint: `Create a claim record at surface/claims/${lang}/${claimId}.md with claimId "${claimId}".`,
              data: { slug, lang, claimId },
            });
          }
        }
      }
    }

    // RG-PROV-04: sourceId must appear in Quellen section
    if (status === "published" && sources.length > 0) {
      const prosePath = resolveProsePath(appDir, lang, slug);
      if (existsSync(prosePath)) {
        const proseContent = await readFile(prosePath, "utf-8");
        const quellenContent = getQuellenSectionContent(proseContent);
        for (const source of sources) {
          if (!source.sourceId) continue;
          if (!quellenContent.includes(source.sourceId)) {
            diagnostics.push({
              ruleId: "RG-PROV-04",
              severity: "error",
              file: prosePath,
              message: `article "${articleId}" sourceId "${source.sourceId}" not found in Quellen section`,
              fixHint: `Add source "${source.sourceId}" to the ## Quellen section of the prose body.`,
              data: { slug, lang, sourceId: source.sourceId },
            });
          }
        }
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "ratgeber.provenance.validate",
      `ratgeber.provenance.validate: OK — ${records.length} article(s) conform`,
    );
  }

  return diagnosticsResult(command, diagnostics);
}
