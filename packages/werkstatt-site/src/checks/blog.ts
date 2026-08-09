import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  RFC-0167/RFC-0325 blog.validate. Enforces the article contract over the dated article pages
  declared in system.md (pages[].article) AND over "article"-typed Programmatic Surface pages
  (e.g. Ratgeber) from src/surface.generated.yaml. No-op pass when the `blog` feature is not
  entitled for the app, or when the app has no article pages of either kind.
</purpose>
<non-goals>
  <item>Do not validate prose-reference existence — content.references.validate owns that.</item>
  <item>Do not read content via the Astro runtime — disk only, like feed.generate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0167: initial implementation.</item>
  <item>RFC-0325: also validate "article"-typed Programmatic Surface entries.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { passResult, resultFromViolations } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { readSurfaceArticleTypedEntries } from "./lib/surface-articles.ts";

interface ArticleConfig {
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
  tags?: string[];
}

/** Read the resolved blog entitlement from the generated artifact. Default: not entitled. */
async function isBlogEntitled(appDir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf-8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) && parsed.features.includes("blog");
  } catch {
    return false;
  }
}

/** Parse an ISO-ish date; return ms or null when unparseable. */
function parseDate(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Collect candidate person names from the people content collection (team/founders/board). */
async function collectBusinessText(appDir: string): Promise<string> {
  const peopleDir = join(appDir, "src", "content", "people");
  const files = await collectFiles(peopleDir, { extensions: [".md"], ignore: () => false });
  let text = "";
  for (const abs of files) {
    text += "\n" + (await readFile(abs, "utf-8"));
  }
  return text.toLowerCase();
}

/** Validate one article's dates/tags/author against the RFC-0167 contract, appending to `violations`. */
function validateArticleConfig(
  id: string,
  article: ArticleConfig,
  businessText: string,
  violations: string[],
): void {
  // publishedAt: required and a valid date.
  if (!article.publishedAt) {
    violations.push(`[missing-publishedAt] ${id}: article has no publishedAt`);
  } else if (parseDate(article.publishedAt) === null) {
    violations.push(
      `[invalid-publishedAt] ${id}: publishedAt is not a valid date: ${article.publishedAt}`,
    );
  }

  // updatedAt: optional; if present must be valid and not before publishedAt.
  if (article.updatedAt !== undefined) {
    const upd = parseDate(article.updatedAt);
    const pub = article.publishedAt ? parseDate(article.publishedAt) : null;
    if (upd === null) {
      violations.push(
        `[invalid-updatedAt] ${id}: updatedAt is not a valid date: ${article.updatedAt}`,
      );
    } else if (pub !== null && upd < pub) {
      violations.push(
        `[updatedAt-before-publishedAt] ${id}: updatedAt ${article.updatedAt} precedes publishedAt ${article.publishedAt}`,
      );
    }
  }

  // tags: optional; when present every tag must be a non-empty string.
  if (article.tags !== undefined) {
    if (
      !Array.isArray(article.tags) ||
      article.tags.some((t) => typeof t !== "string" || t.trim() === "")
    ) {
      violations.push(`[invalid-tags] ${id}: tags must be a list of non-empty strings`);
    }
  }

  // author: when present must resolve to a person named in the people content.
  if (article.author !== undefined) {
    if (article.author.trim() === "") {
      violations.push(`[empty-author] ${id}: author is empty`);
    } else if (!businessText.includes(article.author.toLowerCase())) {
      violations.push(
        `[unknown-author] ${id}: author "${article.author}" not found in people content`,
      );
    }
  }
}

export async function runBlogValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;

  // RFC-0167/0169: disabled sites are a no-op pass.
  if (!(await isBlogEntitled(appDir))) {
    return passResult("blog.validate", "blog.validate: skipped (blog feature not entitled)");
  }

  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];

  const articlePages = pages
    .map((p) => ({
      page: p,
      article: (p as Record<string, unknown>).article as ArticleConfig | undefined,
    }))
    .filter((x): x is { page: (typeof pages)[number]; article: ArticleConfig } =>
      Boolean(x.article),
    );

  // RFC-0325: "article"-typed Programmatic Surface pages (e.g. Ratgeber) carry the same
  // publishedAt/updatedAt/author/tags contract on the generated route entry. Read dates-optional
  // so a missing publishedAt is flagged rather than silently skipped.
  const surfaceArticles = await readSurfaceArticleTypedEntries(appDir);

  if (articlePages.length === 0 && surfaceArticles.length === 0) {
    return passResult("blog.validate", "blog.validate: OK — blog entitled, no article pages yet");
  }

  const businessText = await collectBusinessText(appDir);
  const violations: string[] = [];

  for (const { page, article } of articlePages) {
    const id = String((page as Record<string, unknown>).pageId ?? "(unknown)");
    validateArticleConfig(id, article, businessText, violations);
  }

  for (const entry of surfaceArticles) {
    validateArticleConfig(entry.pageId, entry.article ?? {}, businessText, violations);
  }

  const total = articlePages.length + surfaceArticles.length;
  if (violations.length === 0) {
    return passResult("blog.validate", `blog.validate: OK — ${total} article(s) conform`);
  }
  return resultFromViolations("blog.validate", violations);
}
