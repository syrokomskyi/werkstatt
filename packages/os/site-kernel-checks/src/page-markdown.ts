/*
<MODULE_CONTRACT>
<purpose>RFC-0166: build-time per-page Markdown twins. page.markdown.generate writes a same-path
index.md for every full/summary page (all languages) from the disk SemanticSiteModel — no runtime
worker, no HTML scraping. page.markdown.validate verifies every rel=alternate markdown link in the
rendered HTML resolves to an emitted twin.</purpose>
<non-goals>
  <item>Do not fetch the site or convert HTML — content is already structured Markdown.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0166: initial implementation.</item>
  <item>RFC-0377: emit MarkdownTwinSemanticMeta in generated twin frontmatter.</item>
  <item>RFC-0602: replace volatile buildDate with null for person-slug markdown twins.</item>
</CHANGE_SUMMARY>
*/

import { dirname, join, relative } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/share/fs";
import { parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { DEFAULT_PROFILE_BASE_BY_LANG } from "@warpgogol/share/people-profile-defaults";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import {
  loadSemanticSiteModel,
  loadSystemManifest,
  createFsSemanticReader,
} from "@warpgogol/site-kernel-content";
import {
  buildPageMarkdown,
  markdownTwinRelPath,
  toPathname,
  buildMarkdownTwin,
  buildSemanticPageModelWith,
  type MarkdownTwinProvenance,
  type MarkdownTwinSemanticMeta,
  type SemanticBuildProfile,
  type SemanticPageType,
  resolvePageUpdateStamp,
  AUDIENCE_BY_PAGE_TYPE,
  PRIORITY_BY_PAGE_TYPE,
  DOMAIN_BY_PAGE_TYPE,
  SEMANTIC_PAGE_TYPES,
} from "@warpgogol/share/semantic";
import { canonicalPageUrl, type CanonicalUrlOptions } from "@warpgogol/share/canonical-url";
import { localizeUrl } from "@warpgogol/share/url-policy";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { failResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import {
  readSurfaceArticleEntries,
  resolveSurfaceArticlePage,
  readSurfaceTwinEntries,
} from "./lib/surface-articles.ts";

/** RFC-0325: article-typed surface pages carry no organization/people/initiatives — the markdown
 * page builder never reads them for semanticType "article" (see buildMarkdownPageSemantic). */
const EMPTY_ARTICLE_PROFILE: SemanticBuildProfile = {
  organization: { name: "", description: "", url: "" },
  people: [],
  initiatives: [],
};

// RFC-0375: public/*.md twins are Category B (registry-only) files.
// No GENERATED_MARKER is emitted in the output.

/** RFC-0320: default license URL — may be overridden by system.md or ai.txt. */
const DEFAULT_LICENSE_URL = "https://warpgogol.com/ai.txt";

function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isGeneratedMarkdownTwin(_content: string): boolean {
  // RFC-0375: Category B files no longer carry markers — always treat as generated.
  return true;
}

/** RFC-0320: Resolve license URL from ai.txt or system.md. */
async function resolveLicenseUrl(appDir: string, siteUrl: string): Promise<string> {
  // Check for public/ai.txt
  const aiTxtPath = join(appDir, "public", "ai.txt");
  if (existsSync(aiTxtPath)) {
    return `${siteUrl.replace(/\/$/, "")}/ai.txt`;
  }
  return DEFAULT_LICENSE_URL;
}

function buildMarkdownTwinSemanticMeta(
  page: {
    type: SemanticPageType;
    lang: string;
    url: string;
    title: string;
    description: string;
    audience?: string;
    keywords?: string[];
  },
  route: string,
  pageId?: string,
): MarkdownTwinSemanticMeta {
  const id =
    pageId ||
    (() => {
      try {
        return toPathname(page.url).replace(/^\//, "").replace(/\/$/, "") || "home";
      } catch {
        return "unknown";
      }
    })();
  const type = page.type;
  return {
    id,
    route,
    title: page.title,
    type,
    domain: DOMAIN_BY_PAGE_TYPE[type],
    audience: page.audience ?? AUDIENCE_BY_PAGE_TYPE[type],
    lang: page.lang,
    metaDescription: page.description.slice(0, 160),
    priority: PRIORITY_BY_PAGE_TYPE[type],
    tags: page.keywords?.length ? page.keywords : [],
    visibility: "public",
  };
}

export async function runPageMarkdownGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const contentDir = join(paths.appDirectory, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const defaultLang = defaultLanguageFromManifest(manifest);
  const languages = manifest.i18n?.supported ? Object.keys(manifest.i18n.supported) : [defaultLang];
  const licenseUrl = await resolveLicenseUrl(paths.appDirectory, siteUrl);
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl: siteUrl.replace(/\/$/, ""),
    defaultLanguage: defaultLang,
    supportedLanguages: languages,
    trailingSlash: "always",
  };

  // Build a pageId → update stamp map from the manifest
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const stampMap = new Map<string, ReturnType<typeof resolvePageUpdateStamp>>();
  for (const page of pages) {
    if (!page.pageId) continue;
    const stamp = resolvePageUpdateStamp({
      pageId: page.pageId,
      lang: defaultLang,
      pageEntry: page as Record<string, unknown>,
    });
    stampMap.set(page.pageId, stamp);
  }

  // RFC-0325: "article"-typed Programmatic Surface pages (e.g. Ratgeber) get twins too — the
  // artifact only carries them when pseo is entitled, so no separate gate is needed here.
  const surfaceArticles = await readSurfaceArticleEntries(paths.appDirectory);
  const articleReader = createFsSemanticReader(contentDir, defaultLang);

  let written = 0;
  const seen = new Set<string>();
  for (const language of languages) {
    const semanticSite = await loadSemanticSiteModel({ contentDir, lang: language, siteUrl });
    for (const page of semanticSite.pages) {
      const depth = page.output?.llms?.depth ?? "full";
      if (depth !== "full" && depth !== "summary") continue;
      const rel = markdownTwinRelPath(toPathname(page.url), { supportedLangs: languages });
      if (seen.has(rel)) continue;
      seen.add(rel);
      const dest = join(paths.publicDirectory, rel);

      // RFC-0320: resolve canonical URL, update stamp, and pageId for provenance frontmatter.
      const pageUrlPath = page.url
        .replace(/^https?:\/\/[^/]+/, "")
        .replace(/^\//, "")
        .replace(/\/$/, "");
      const pageEntry = pages.find((p) => {
        const routes = p.routes as Record<string, string> | undefined;
        if (!routes) return false;
        const route = routes[language];
        if (route === undefined) return false;
        const normalizedRoute = route.replace(/^\//, "").replace(/\/$/, "");
        if (normalizedRoute === "") {
          return language === defaultLang ? pageUrlPath === "" : pageUrlPath === language;
        }
        const expectedPath =
          language === defaultLang ? normalizedRoute : `${language}/${normalizedRoute}`;
        return pageUrlPath === expectedPath;
      }) as (typeof pages)[number] | undefined;
      const pageRoutes = pageEntry?.routes as Record<string, string> | undefined;
      const route = pageRoutes?.[language] ?? "";
      const canonical = canonicalPageUrl({ lang: language, route, kind: "html" }, canonicalOpts);

      const pageId = pageEntry?.pageId as string | undefined;
      const stampResult = pageId ? stampMap.get(pageId) : undefined;

      const lastModified = stampResult?.stamp?.date ?? page.dateModified ?? page.datePublished;
      if (!lastModified) {
        return failResult("page.markdown.generate", [
          `Page ${page.url} has no source-backed update stamp for lastModified. Cannot emit twin without provenance date.`,
        ]);
      }
      const provenance: MarkdownTwinProvenance = {
        canonical,
        language,
        lastModified,
        license: licenseUrl,
        generator: "page.markdown.generate",
        sourceKind: "page",
        semantic: buildMarkdownTwinSemanticMeta(page, route ? `/${route}/` : "/", pageId),
      };

      const body = buildPageMarkdown(page);
      const twin = buildMarkdownTwin(body, provenance);

      if (!context.dryRun) {
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, `${twin}`, "utf-8");
      }
      written += 1;
    }

    for (const entry of surfaceArticles) {
      if (entry.geo === "off") continue;
      const routeSlug = entry.routes[language];
      if (routeSlug === undefined) continue;
      const bakedPage = await resolveSurfaceArticlePage(
        paths.appDirectory,
        entry,
        language,
        defaultLang,
      );
      if (!bakedPage) continue;

      const url = `${siteUrl.replace(/\/$/, "")}${localizeUrl(language, routeSlug, { defaultLanguage: defaultLang })}`;
      const rel = markdownTwinRelPath(toPathname(url), { supportedLangs: languages });
      if (seen.has(rel)) continue;
      seen.add(rel);

      const model = await buildSemanticPageModelWith(articleReader, {
        pageId: entry.pageId,
        semanticType: "article" as SemanticPageType,
        lang: language,
        url,
        profile: EMPTY_ARTICLE_PROFILE,
        fallbackFrontmatter: bakedPage as unknown as Record<string, unknown>,
      });
      if (!model) continue;
      model.datePublished = entry.article.publishedAt;
      if (entry.article.updatedAt) model.dateModified = entry.article.updatedAt;
      if (entry.article.author) model.author = entry.article.author;
      if (entry.article.tags?.length) model.keywords = entry.article.tags;

      const canonical = canonicalPageUrl(
        { lang: language, route: routeSlug, kind: "html" },
        canonicalOpts,
      );
      const stampResult = resolvePageUpdateStamp({
        pageId: entry.pageId,
        lang: language,
        pageEntry: { article: entry.article },
      });
      const lastModified = stampResult.stamp?.date;
      if (!lastModified) {
        return failResult("page.markdown.generate", [
          `Page ${url} has no source-backed update stamp for lastModified. Cannot emit twin without provenance date.`,
        ]);
      }

      const articleRoute = localizeUrl(language, routeSlug, { defaultLanguage: defaultLang });
      const provenance: MarkdownTwinProvenance = {
        canonical,
        language,
        lastModified,
        license: licenseUrl,
        generator: "page.markdown.generate",
        sourceKind: "page",
        semantic: buildMarkdownTwinSemanticMeta(model, articleRoute, entry.pageId),
      };

      const dest = join(paths.publicDirectory, rel);
      const body = buildPageMarkdown(model);
      const twin = buildMarkdownTwin(body, provenance);

      if (!context.dryRun) {
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, `${twin}`, "utf-8");
      }
      written += 1;
    }

    // RFC-0166: Person profile pages (team.profiles entitlement) emit rel=alternate
    // text/markdown links but have no content/pages/*.md source — synthesize twins
    // from the people collection, mirroring sitemap-helpers.ts.
    // RFC-0510: prefer the Team page (pageId === "team" or semanticType === "collection") as the
    // base segment for person profile twins. Fall back to the About page when no Team page exists.
    // Fix: prioritize pageId === "team" over semanticType === "collection" — multiple pages can
    // have semanticType "collection" (e.g. ratgeber hub), and the OR condition matched the wrong one.
    const teamPage =
      pages.find((p) => (p as Record<string, unknown>).pageId === "team") ??
      pages.find((p) => (p as Record<string, unknown>).semanticType === "collection");
    const aboutPage = pages.find((p) => (p as Record<string, unknown>).semanticType === "about");
    const parentPage = teamPage ?? aboutPage;
    const baseFor = (lang: string): string =>
      (parentPage?.routes as Record<string, string> | undefined)?.[lang] ??
      DEFAULT_PROFILE_BASE_BY_LANG[lang] ??
      "team";
    const peopleDir = join(contentDir, "people", defaultLang);
    let personSlugs: string[] = [];
    try {
      const personFiles = await readdir(peopleDir);
      for (const f of personFiles) {
        if (!f.endsWith(".md")) continue;
        const data = parseMarkdownFrontmatter(await readFile(join(peopleDir, f), "utf-8")).data as
          Record<string, unknown> | undefined;
        const page = data?.["page"] as { enabled?: unknown } | undefined;
        if (page?.enabled !== true) continue;
        const slug =
          typeof data?.["slug"] === "string" ? (data["slug"] as string) : f.replace(/\.md$/, "");
        personSlugs.push(slug);
      }
    } catch {
      // No people directory — skip silently.
    }

    const buildDate = null as string | null;
    for (const slug of personSlugs) {
      const routeSlug = `${baseFor(language)}/${slug}`;
      const url = `${siteUrl.replace(/\/$/, "")}${localizeUrl(language, routeSlug, { defaultLanguage: defaultLang })}`;
      const rel = markdownTwinRelPath(toPathname(url), { supportedLangs: languages });
      if (seen.has(rel)) continue;
      seen.add(rel);

      // Read person frontmatter from the current language (fallback to default).
      const personFile = join(contentDir, "people", language, `${slug}.md`);
      const fallbackFile = join(contentDir, "people", defaultLang, `${slug}.md`);
      const sourceFile = existsSync(personFile) ? personFile : fallbackFile;
      if (!existsSync(sourceFile)) continue;
      const personData = parseMarkdownFrontmatter(await readFile(sourceFile, "utf-8"))
        .data as Record<string, unknown>;

      // Build synthetic frontmatter mirroring resolve-route.ts person page synthesis.
      const name = (personData["name"] as string) ?? slug;
      const role = (personData["role"] as string) ?? undefined;
      const bio = (personData["bio"] as string) ?? undefined;
      const statement = (personData["statement"] as string) ?? undefined;
      const syntheticFrontmatter: Record<string, unknown> = {
        title: name,
        description: role ?? bio?.split("\n")[0]?.trim() ?? name,
        blocks: [
          {
            id: "hero",
            type: "hero",
            props: {
              header: { heading: name, subheading: role, level: 1 },
              description: statement,
              imageAlt: name,
            },
          },
          {
            id: "bio",
            type: "markdown",
            props: {
              contentRef: `prose/${slug}`,
              hideSectionNumber: true,
              pageId: `person:${slug}`,
            },
          },
        ],
      };

      const model = await buildSemanticPageModelWith(articleReader, {
        pageId: `person:${slug}`,
        semanticType: "person" as SemanticPageType,
        lang: language,
        url,
        profile: EMPTY_ARTICLE_PROFILE,
        fallbackFrontmatter: syntheticFrontmatter,
      });
      if (!model) continue;

      const canonical = canonicalPageUrl(
        { lang: language, route: routeSlug, kind: "html" },
        canonicalOpts,
      );
      const provenance: MarkdownTwinProvenance = {
        canonical,
        language,
        lastModified: buildDate,
        license: licenseUrl,
        generator: "page.markdown.generate",
        sourceKind: "page",
        semantic: buildMarkdownTwinSemanticMeta(model, `/${routeSlug}/`, `person:${slug}`),
      };

      const dest = join(paths.publicDirectory, rel);
      const body = buildPageMarkdown(model);
      const twin = buildMarkdownTwin(body, provenance);

      if (!context.dryRun) {
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, `${twin}`, "utf-8");
      }
      written += 1;
    }

    // RFC-0166: Non-article surface entries (e.g. "content"-typed) with geo !== "off" also
    // emit rel=alternate text/markdown links in rendered HTML, so they need twins too.
    const surfaceTwins = await readSurfaceTwinEntries(paths.appDirectory);
    const nonArticleTwins = surfaceTwins.filter((e) => e.semanticType !== "article");
    for (const entry of nonArticleTwins) {
      const routeSlug = entry.routes[language];
      if (routeSlug === undefined) continue;
      const bakedPage = await resolveSurfaceArticlePage(
        paths.appDirectory,
        entry,
        language,
        defaultLang,
      );
      if (!bakedPage) continue;

      const url = `${siteUrl.replace(/\/$/, "")}${localizeUrl(language, routeSlug, { defaultLanguage: defaultLang })}`;
      const rel = markdownTwinRelPath(toPathname(url), { supportedLangs: languages });
      if (seen.has(rel)) continue;
      seen.add(rel);

      const semanticType = (entry.semanticType ?? "content") as SemanticPageType;
      const model = await buildSemanticPageModelWith(articleReader, {
        pageId: entry.pageId,
        semanticType,
        lang: language,
        url,
        profile: EMPTY_ARTICLE_PROFILE,
        fallbackFrontmatter: bakedPage as unknown as Record<string, unknown>,
      });
      if (!model) continue;

      const canonical = canonicalPageUrl(
        { lang: language, route: routeSlug, kind: "html" },
        canonicalOpts,
      );
      const lastModified = buildDate;

      const articleRoute = localizeUrl(language, routeSlug, { defaultLanguage: defaultLang });
      const provenance: MarkdownTwinProvenance = {
        canonical,
        language,
        lastModified,
        license: licenseUrl,
        generator: "page.markdown.generate",
        sourceKind: "page",
        semantic: buildMarkdownTwinSemanticMeta(model, articleRoute, entry.pageId),
      };

      const dest = join(paths.publicDirectory, rel);
      const body = buildPageMarkdown(model);
      const twin = buildMarkdownTwin(body, provenance);

      if (!context.dryRun) {
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, `${twin}`, "utf-8");
      }
      written += 1;
    }
  }

  let removed = 0;
  if (!context.dryRun) {
    const markdownFiles = await collectFiles(paths.publicDirectory, {
      extensions: [".md"],
      ignore: () => false,
    });
    for (const file of markdownFiles) {
      const rel = normalizeRelPath(relative(paths.publicDirectory, file));
      if (seen.has(rel)) continue;
      const content = await readFile(file, "utf-8");
      if (!isGeneratedMarkdownTwin(content)) continue;
      await rm(file);
      removed += 1;
    }
  }

  return {
    data: { command: "page.markdown.generate", status: "pass", count: written, removed },
    exitCode: 0,
    summary: context.dryRun
      ? `page.markdown.generate: dry-run — ${written} twin(s)`
      : `page.markdown.generate: ${written} markdown twin(s), ${removed} stale twin(s) removed`,
  };
}

export async function runPageMarkdownValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distDir = join(paths.appDirectory, "dist");
  const publicDir = paths.publicDirectory;
  const errors: string[] = [];
  const warnings: string[] = [];
  let checked = 0;
  let htmlSeen = false;

  const linkRe =
    /<link[^>]+rel=["']alternate["'][^>]+type=["']text\/markdown["'][^>]+href=["']([^"']+)["']/i;

  const htmlFiles = await collectFiles(distDir, { extensions: [".html"], ignore: () => false });
  for (const abs of htmlFiles) {
    htmlSeen = true;
    const href = (await readFile(abs, "utf8")).match(linkRe)?.[1];
    if (!href) continue;
    checked += 1;
    const rel = href.replace(/^\/+/, "");
    const candidates = [join(distDir, rel), join(distDir, "client", rel)];
    if (!candidates.some((p) => existsSync(p))) {
      errors.push(`${abs}: markdown twin missing for ${href}`);
    }
  }

  // RFC-0320: MDMETA-01..07 — validate provenance frontmatter on generated twins.
  const { parseMarkdownTwinFrontmatter, computeContentHash } =
    await import("@warpgogol/share/semantic");
  const markdownFiles = await collectFiles(publicDir, { extensions: [".md"], ignore: () => false });
  for (const abs of markdownFiles) {
    const content = await readFile(abs, "utf-8");
    if (!isGeneratedMarkdownTwin(content)) continue;

    // Strip the generated marker comment before parsing frontmatter.
    const stripped = content.replace(/^<!--[\s\S]*?-->\n\n/, "");
    const parsed = parseMarkdownTwinFrontmatter(stripped);

    // MDMETA-01: Missing YAML frontmatter
    if (!parsed) {
      errors.push(`MDMETA-01: ${abs}: missing YAML frontmatter`);
      continue;
    }

    const { frontmatter, body } = parsed;
    const requiredFields = [
      "canonical",
      "language",
      "lastModified",
      "contentHash",
      "license",
      "generator",
      "sourceKind",
    ];

    // MDMETA-02: Missing required field (lastModified may be null per RFC-0602)
    for (const field of requiredFields) {
      if (!(field in frontmatter) || (frontmatter[field] == null && field !== "lastModified")) {
        errors.push(`MDMETA-02: ${abs}: missing required field "${field}"`);
      }
    }

    // MDMETA-03: canonical is not absolute
    const canonical = frontmatter.canonical;
    if (typeof canonical === "string" && !/^https?:\/\//.test(canonical)) {
      errors.push(`MDMETA-03: ${abs}: canonical is not an absolute URL: ${canonical}`);
    }

    // MDMETA-04: lastModified format (null is valid per RFC-0602 determinism)
    const lastModified = frontmatter.lastModified;
    if (
      lastModified != null &&
      typeof lastModified === "string" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(lastModified)
    ) {
      errors.push(
        `MDMETA-04: ${abs}: lastModified is not a valid YYYY-MM-DD date: ${lastModified}`,
      );
    }

    // MDMETA-05: contentHash mismatch
    if (typeof frontmatter.contentHash === "string") {
      const actualHash = computeContentHash(body);
      if (frontmatter.contentHash !== actualHash) {
        errors.push(
          `MDMETA-05: ${abs}: contentHash mismatch (declared: ${frontmatter.contentHash}, actual: ${actualHash})`,
        );
      }
    }

    // MDMETA-06: license URL missing or not absolute
    const license = frontmatter.license;
    if (typeof license === "string" && !/^https?:\/\//.test(license)) {
      errors.push(`MDMETA-06: ${abs}: license is not an absolute URL: ${license}`);
    }

    // MDMETA-07: Old relative Source: /... footer remains
    if (/^Source:\s*\//m.test(body)) {
      errors.push(`MDMETA-07: ${abs}: old relative "Source: /..." footer remains in body`);
    }

    // RFC-0377: semantic frontmatter validation.
    const semanticFields = [
      "id",
      "route",
      "title",
      "type",
      "domain",
      "audience",
      "lang",
      "metaDescription",
      "priority",
      "tags",
    ];

    // MDMETA-08: Missing required semantic field
    for (const field of semanticFields) {
      if (
        !(field in frontmatter) ||
        frontmatter[field] === undefined ||
        frontmatter[field] === ""
      ) {
        errors.push(`MDMETA-08: ${abs}: missing required semantic field "${field}"`);
      }
    }

    // MDMETA-09: type is a valid SemanticPageType
    if (
      typeof frontmatter.type === "string" &&
      !SEMANTIC_PAGE_TYPES.includes(frontmatter.type as SemanticPageType)
    ) {
      errors.push(`MDMETA-09: ${abs}: invalid type "${frontmatter.type}"`);
    }

    // MDMETA-10: priority is a number in [0.0, 1.0]
    const priority =
      typeof frontmatter.priority === "string"
        ? Number(frontmatter.priority)
        : Number(frontmatter.priority);
    if (Number.isNaN(priority) || priority < 0 || priority > 1) {
      errors.push(
        `MDMETA-10: ${abs}: priority must be a number in [0.0, 1.0]: ${frontmatter.priority}`,
      );
    }

    // MDMETA-11: visibility is a valid enum when present
    if (frontmatter.visibility) {
      const validVisibility = ["public", "internal", "experimental"];
      if (
        typeof frontmatter.visibility !== "string" ||
        !validVisibility.includes(frontmatter.visibility)
      ) {
        errors.push(`MDMETA-11: ${abs}: invalid visibility "${frontmatter.visibility}"`);
      }
    }

    // MDMETA-12: schema tag is gogol.markdown-twin@2
    if (frontmatter.schema !== "gogol.markdown-twin@2") {
      errors.push(
        `MDMETA-12: ${abs}: schema must be "gogol.markdown-twin@2" (found: ${frontmatter.schema})`,
      );
    }

    // RFC-0377: body section validation.
    // MDBODY-01: Summary is required
    if (!/^## Summary\b/m.test(body)) {
      errors.push(`MDBODY-01: ${abs}: missing required "## Summary" section`);
    }
    // MDBODY-02: Business context is required
    if (!/^## Business context\b/m.test(body)) {
      errors.push(`MDBODY-02: ${abs}: missing required "## Business context" section`);
    }
    // MDBODY-03..05: Data / APIs, User flows, Constraints are warnings
    if (!/^## Data \/ APIs\b/m.test(body)) {
      warnings.push(`MDBODY-03 (warning): ${abs}: missing "## Data / APIs" section`);
    }
    if (!/^## User flows\b/m.test(body)) {
      warnings.push(`MDBODY-04 (warning): ${abs}: missing "## User flows" section`);
    }
    if (!/^## Constraints\b/m.test(body)) {
      warnings.push(`MDBODY-05 (warning): ${abs}: missing "## Constraints" section`);
    }
  }

  if (!htmlSeen && markdownFiles.length === 0) {
    return {
      data: { command: "page.markdown.validate", status: "pass" },
      exitCode: 0,
      summary: "page.markdown.validate: skipped (no dist/ HTML or public/ twins)",
    };
  }
  if (errors.length > 0) {
    return failResult("page.markdown.validate", [...errors, ...warnings]);
  }
  const warningSummary = warnings.length > 0 ? `; ${warnings.length} warning(s)` : "";
  return {
    data: { command: "page.markdown.validate", status: "pass", checked, warnings },
    exitCode: 0,
    summary: `page.markdown.validate: ${checked} twin link(s) ok, ${markdownFiles.length} twin(s) frontmatter ok${warningSummary}`,
  };
}
