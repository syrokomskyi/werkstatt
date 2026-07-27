/*
<MODULE_CONTRACT>
<purpose>
  RFC-0325: article.depth.validate. Generic, site-policy-driven check that dated editorial
  ("article"-typed) pages — declared in system.md (pages[].article) or baked onto a "article"-typed
  Programmatic Surface route entry (RFC-0325 blueprint extension) — are substantive: source-backed
  dates, a normalized body word-count floor, H2 sections backed by real content, feed inclusion, and
  Markdown twin provenance. It does not know any app's article slugs — it discovers article pages
  purely by semantic type.
</purpose>
<non-goals>
  <item>Do not know any app's article slugs — discovery is by semanticType only.</item>
  <item>Do not pad or rewrite content — read-only, disk-only (mirrors blog.validate/feed.generate).</item>
  <item>Do not re-validate non-prose block substance — RFC-0194 pseo.validate/scoreSubstance already covers generic thin-content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0325: initial implementation.</item>
  <item>RFC-0501: skip ART-DEPTH-02 (word count) for ratgeber articles — ratgeber.article.validate handles it as RG-ART-02.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest, createFsSemanticReader } from "@warpgogol/site-kernel-content";
import {
  buildSemanticPageModelWith,
  markdownTwinRelPath,
  toPathname,
  type SemanticBuildProfile,
  type SemanticPageModel,
  type SemanticPageType,
} from "@warpgogol/share/semantic";
import { canonicalPageUrl, type CanonicalUrlOptions } from "@warpgogol/share/canonical-url";
import { localizeUrl } from "@warpgogol/share/url-policy";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import {
  readSurfaceArticleTypedEntries,
  resolveSurfaceArticlePage,
} from "./lib/surface-articles.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

/** RFC-0325: site policy floor. A future RFC may make this app-configurable; today it is fixed. */
const WORD_FLOOR = 500;
/** Minimum words a prose H2 section needs beneath it to count as substantive, not heading-only. */
const SECTION_MIN_WORDS = 8;

const EMPTY_ARTICLE_PROFILE: SemanticBuildProfile = {
  organization: { name: "", description: "", url: "" },
  people: [],
  initiatives: [],
};

interface ArticleCandidate {
  id: string;
  routeSlug?: string;
  surfaceId?: string;
  article: { publishedAt?: string; updatedAt?: string };
  fallbackFrontmatter?: Record<string, unknown>;
}

type ArticleDepthRuleId =
  "ART-DEPTH-01" | "ART-DEPTH-02" | "ART-DEPTH-03" | "ART-DEPTH-04" | "ART-DEPTH-05";

export function articleDepthDiagnostic(violation: string): Diagnostic {
  const match = /^(ART-DEPTH-\d{2}):\s*(.*)$/.exec(violation);
  const ruleId = (match?.[1] ?? "ART-DEPTH-01") as ArticleDepthRuleId;
  return {
    ruleId,
    severity: "error",
    message: match?.[2] ?? violation,
  };
}

function parseDate(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Rough word count over already reference-substituted, plain-ish Markdown text. */
export function countWords(text: string | undefined): number {
  if (!text) return 0;
  const stripped = text
    .split("\n")
    .filter((line) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) // table separator rows
    .join("\n")
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/^[-*]\s+(\[[ x]\]\s+)?/gm, "") // list/checklist bullets
    .replace(/[|_*`>]/g, " "); // table pipes and emphasis/quote markers
  const words = stripped.split(/\s+/).filter(Boolean);
  return words.length;
}

/** Every H2 ("## ") section in the prose body must have substantive content before the next heading. */
export function findThinSections(bodyText: string | undefined): string[] {
  if (!bodyText) return [];
  const lines = bodyText.split("\n");
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line.trim());
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1]!.trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections
    .filter((s) => countWords(s.body.join("\n")) < SECTION_MIN_WORDS)
    .map((s) => s.heading);
}

/** Build the SemanticPageModel for one article candidate at the given language (default language only). */
async function buildArticleModel(
  reader: Parameters<typeof buildSemanticPageModelWith>[0],
  candidate: ArticleCandidate,
  lang: string,
  url: string,
): Promise<SemanticPageModel | null> {
  return buildSemanticPageModelWith(reader, {
    pageId: candidate.id,
    semanticType: "article" as SemanticPageType,
    lang,
    url,
    profile: EMPTY_ARTICLE_PROFILE,
    ...(candidate.fallbackFrontmatter
      ? { fallbackFrontmatter: candidate.fallbackFrontmatter }
      : {}),
  });
}

export async function runArticleDepthValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const contentDir = join(appDir, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const defaultLang = defaultLanguageFromManifest(manifest);
  const siteUrl = ((await readAstroSiteUrl(appDir)) ?? "https://example.com").replace(/\/$/, "");
  const supportedLangs = Object.keys(
    (manifest.i18n as { supported?: Record<string, unknown> } | undefined)?.supported ?? {
      [defaultLang]: true,
    },
  );
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl: siteUrl,
    defaultLanguage: defaultLang,
    supportedLanguages: supportedLangs,
    trailingSlash: "always",
  };

  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const candidates: ArticleCandidate[] = [];

  for (const page of pages) {
    const p = page as Record<string, unknown>;
    if (p.semanticType !== "article") continue;
    const routes = p.routes as Record<string, string> | undefined;
    candidates.push({
      id: String(p.pageId ?? "(unknown)"),
      routeSlug: routes?.[defaultLang],
      article: (p.article as { publishedAt?: string; updatedAt?: string } | undefined) ?? {},
    });
  }

  const surfaceEntries = await readSurfaceArticleTypedEntries(appDir);
  for (const entry of surfaceEntries) {
    const bakedPage = await resolveSurfaceArticlePage(appDir, entry, defaultLang, defaultLang);
    candidates.push({
      id: entry.pageId,
      routeSlug: entry.routes[defaultLang],
      surfaceId: entry.surfaceId,
      article: entry.article ?? {},
      fallbackFrontmatter: bakedPage as unknown as Record<string, unknown> | undefined,
    });
  }

  if (candidates.length === 0) {
    return passResult("article.depth.validate", "article.depth.validate: OK — no article pages");
  }

  const reader = createFsSemanticReader(contentDir, defaultLang);
  const violations: string[] = [];

  // ART-DEPTH-04/05 read already-generated public artifacts; both are missing on a fresh
  // author-only checkout (no build.prepare yet), so absence is a skip, not a failure.
  const feedPath = join(paths.publicDirectory, "feed.xml");
  const feedXml = existsSync(feedPath) ? await readFile(feedPath, "utf-8") : null;

  for (const candidate of candidates) {
    const { id, article, routeSlug } = candidate;

    // ART-DEPTH-01: required, valid, ordered dates.
    if (!article.publishedAt) {
      violations.push(`ART-DEPTH-01: ${id}: article has no publishedAt`);
      continue; // no reliable date basis for the remaining checks
    }
    const pub = parseDate(article.publishedAt);
    if (pub === null) {
      violations.push(
        `ART-DEPTH-01: ${id}: publishedAt is not a valid date: ${article.publishedAt}`,
      );
      continue;
    }
    if (article.updatedAt !== undefined) {
      const upd = parseDate(article.updatedAt);
      if (upd === null) {
        violations.push(`ART-DEPTH-01: ${id}: updatedAt is not a valid date: ${article.updatedAt}`);
      } else if (upd < pub) {
        violations.push(
          `ART-DEPTH-01: ${id}: updatedAt ${article.updatedAt} precedes publishedAt ${article.publishedAt}`,
        );
      }
    }

    if (routeSlug === undefined) continue; // no route to build a model/URL for
    const url = `${siteUrl}${localizeUrl(defaultLang, routeSlug, { defaultLanguage: defaultLang })}`;
    const model = await buildArticleModel(reader, candidate, defaultLang, url);
    if (!model) continue;

    // ART-DEPTH-02: normalized body word floor. Unified blocks (prose-derived and
    // block-derived) cover all content; faqEntries cover the FAQ sections. CTA-labeled
    // items (prefixed "CTA: " by the block extractors) are repeated boilerplate, excluded.
    let words = 0;
    for (const block of model.blocks) {
      words += countWords(block.heading) + countWords(block.summary) + countWords(block.body);
      if (block.facts) {
        for (const fact of block.facts) words += countWords(fact);
      }
      for (const item of block.items ?? []) {
        if (item.title.startsWith("CTA:")) continue;
        words += countWords(item.title) + countWords(item.description);
      }
    }
    for (const faq of model.faqEntries ?? []) {
      words += countWords(faq.question) + countWords(faq.answer);
    }
    // RFC-0501: skip word count for ratgeber articles — ratgeber.article.validate (RG-ART-02) handles it.
    if (candidate.surfaceId === "ratgeber") {
      // word count check delegated to ratgeber.article.validate
    } else if (words < WORD_FLOOR) {
      violations.push(
        `ART-DEPTH-02: ${id}: normalized body is ${words} word(s), below the ${WORD_FLOOR}-word floor`,
      );
    }

    // ART-DEPTH-03: every prose-derived H2 section has substantive content beneath it.
    // RFC-0372: prose blocks (blockType: "prose") replace the old bodyText scan.
    for (const block of model.blocks) {
      if (block.blockType !== "prose") continue;
      if (!block.heading) continue;
      const sectionWords =
        countWords(block.summary) +
        countWords(block.body) +
        (block.facts?.reduce((sum, f) => sum + countWords(f), 0) ?? 0);
      if (sectionWords < SECTION_MIN_WORDS) {
        violations.push(
          `ART-DEPTH-03: ${id}: heading "${block.heading}" has no substantive content beneath it`,
        );
      }
    }

    // ART-DEPTH-04: a dated article's canonical URL appears in the feed (skip if not yet generated).
    if (feedXml !== null) {
      const itemUrl = canonicalPageUrl(
        { lang: defaultLang, route: routeSlug, kind: "html" },
        canonicalOpts,
      );
      if (!feedXml.includes(itemUrl)) {
        violations.push(
          `ART-DEPTH-04: ${id}: dated article is absent from feed.xml (expected ${itemUrl})`,
        );
      }
    }

    // ART-DEPTH-05: the Markdown twin carries source-backed date provenance (skip if not yet generated).
    const twinRel = markdownTwinRelPath(toPathname(url), { supportedLangs });
    const twinPath = join(paths.publicDirectory, twinRel);
    if (existsSync(twinPath)) {
      const twinContent = await readFile(twinPath, "utf-8");
      if (!/^lastModified:\s*"?\d{4}-\d{2}-\d{2}"?/m.test(twinContent)) {
        violations.push(
          `ART-DEPTH-05: ${id}: Markdown twin ${twinRel} is missing lastModified provenance`,
        );
      }
    }
  }

  if (violations.length === 0) {
    return passResult(
      "article.depth.validate",
      `article.depth.validate: OK — ${candidates.length} article(s) conform`,
    );
  }
  return diagnosticsResult("article.depth.validate", violations.map(articleDepthDiagnostic));
}
