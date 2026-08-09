/*
<MODULE_CONTRACT>
<purpose>RFC-0165: feed.generate writes public/feed.xml (RSS 2.0) from the dated article pages
declared in system.md (pages[].article). feed.validate checks the file is well-formed. An app
with no articles still emits a valid, empty-but-conformant feed.</purpose>
<non-goals>
  <item>Do not read content via Astro runtime — disk only, like llms.generate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0165: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "@warpgogol/werkstatt/kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { pageIdToContentFileSlug } from "@warpgogol/werkstatt-site/share/content";
import { buildRssFeed, buildJsonFeed, type FeedItem } from "@warpgogol/werkstatt-site/share/semantic";
import {
  canonicalPageUrl,
  canonicalStaticUrl,
  type CanonicalUrlOptions,
} from "@warpgogol/werkstatt-site/share/canonical-url";
import { failResult } from "./result-helpers.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { readEntitledFeatures } from "./lib/entitlements.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { readSurfaceArticleEntries } from "./lib/surface-articles.ts";

/** RFC-0167/0169: resolved entitlement features, or null when unknown (fail open). */
async function readPageMeta(
  appDir: string,
  lang: string,
  fileSlug: string,
): Promise<{ title: string; description: string }> {
  try {
    const raw = await readFile(
      join(appDir, "src", "content", "pages", lang, `${fileSlug}.md`),
      "utf-8",
    );
    const data = parseMarkdownFrontmatter(raw).data ?? {};
    return {
      title: typeof data.title === "string" ? data.title : fileSlug,
      description: typeof data.description === "string" ? data.description : "",
    };
  } catch {
    return { title: fileSlug, description: "" };
  }
}

export async function runFeedGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const siteUrl = ((await readAstroSiteUrl(appDir)) ?? "https://example.com").replace(/\/$/, "");
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const defaultLang = defaultLanguageFromManifest(manifest);
  const identity = (manifest.identity ?? {}) as { domain?: string; tagline?: string };
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

  // RFC-0167/0169: do not syndicate articles for a site that has not paid for blog.
  const entitledFeatures = await readEntitledFeatures(appDir);
  const blogGated = entitledFeatures !== null && !entitledFeatures.includes("blog");

  const items: FeedItem[] = [];
  for (const page of pages) {
    if (blogGated) break;
    const article = (page as Record<string, unknown>).article as
      { publishedAt?: string; updatedAt?: string } | undefined;
    const slug = (page as Record<string, unknown>).routes as Record<string, string> | undefined;
    if (!article?.publishedAt || !page.pageId) continue;
    const routeSlug = slug?.[defaultLang];
    if (routeSlug === undefined) continue;
    const meta = await readPageMeta(appDir, defaultLang, pageIdToContentFileSlug(page.pageId));
    const itemUrl = canonicalPageUrl(
      { lang: defaultLang, route: routeSlug, kind: "html" },
      canonicalOpts,
    );
    items.push({
      title: meta.title,
      url: itemUrl,
      summary: meta.description,
      publishedAt: article.publishedAt,
      ...(article.updatedAt ? { updatedAt: article.updatedAt } : {}),
    });
  }

  // RFC-0325: Programmatic Surface article pages (e.g. Ratgeber) are dated editorial content too —
  // gated the same as system.md articles (blog entitlement), plus pseo (the entries don't exist in
  // the artifact at all when pseo is unentitled, so this is belt-and-suspenders).
  const pseoGated = entitledFeatures !== null && !entitledFeatures.includes("pseo");
  if (!blogGated && !pseoGated) {
    for (const entry of await readSurfaceArticleEntries(appDir)) {
      const routeSlug = entry.routes[defaultLang];
      if (routeSlug === undefined) continue;
      const itemUrl = canonicalPageUrl(
        { lang: defaultLang, route: routeSlug, kind: "html" },
        canonicalOpts,
      );
      items.push({
        title: entry.page?.title ?? entry.pageId,
        url: itemUrl,
        summary: entry.page?.description ?? "",
        publishedAt: entry.article.publishedAt,
        ...(entry.article.updatedAt ? { updatedAt: entry.article.updatedAt } : {}),
      });
    }
  }

  const feedUrl = canonicalStaticUrl("feed.xml", { baseUrl: siteUrl });
  const feedJsonUrl = canonicalStaticUrl("feed.json", { baseUrl: siteUrl });
  const channelUrl = canonicalPageUrl(
    { lang: defaultLang, route: "", kind: "html" },
    canonicalOpts,
  );

  const xml = buildRssFeed(
    {
      title: identity.domain ?? String(manifest.app ?? "Feed"),
      url: channelUrl,
      description: identity.tagline ?? "",
      language: defaultLang,
      selfUrl: feedUrl,
    },
    items,
  );

  // RFC-0317: JSON Feed v1.1 from the same item set.
  const feedJson = buildJsonFeed({
    title: identity.domain ?? String(manifest.app ?? "Feed"),
    home_page_url: channelUrl,
    feed_url: feedJsonUrl,
    description: identity.tagline ?? "",
    language: defaultLang,
    items,
  });

  if (!context.dryRun) {
    await writeFileAtomic(join(paths.publicDirectory, "feed.xml"), xml);
    await writeFileAtomic(join(paths.publicDirectory, "feed.json"), feedJson);
  }
  return {
    exitCode: 0,
    summary: `feed.generate: ${items.length} item(s) → feed.xml + feed.json`,
    data: { items: items.length },
  };
}

export async function runFeedValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const feedPath = join(paths.publicDirectory, "feed.xml");
  if (!existsSync(feedPath)) {
    return { exitCode: 0, summary: "feed.validate: skipped (no feed.xml; run feed.generate)" };
  }
  const xml = await readFile(feedPath, "utf-8");
  const violations: string[] = [];
  if (!xml.startsWith("<?xml")) violations.push("feed.xml: missing XML declaration");
  if (!/<rss[\s>]/.test(xml)) violations.push("feed.xml: missing <rss> root");
  if (!/<channel>/.test(xml)) violations.push("feed.xml: missing <channel>");
  const itemCount = (xml.match(/<item>/g) ?? []).length;
  const pubDateCount = (xml.match(/<pubDate>/g) ?? []).length;
  if (itemCount !== pubDateCount) {
    violations.push(`feed.xml: ${itemCount} item(s) but ${pubDateCount} pubDate(s)`);
  }

  // RFC-0317: validate feed.json (JSON Feed v1.1) from the same item set.
  const feedJsonPath = join(paths.publicDirectory, "feed.json");
  if (existsSync(feedJsonPath)) {
    try {
      const json = JSON.parse(await readFile(feedJsonPath, "utf-8")) as Record<string, unknown>;
      if (json.version !== "https://jsonfeed.org/version/1.1") {
        violations.push("feed.json: missing or incorrect version field");
      }
      if (!Array.isArray(json.items) && itemCount > 0) {
        violations.push("feed.json: missing items array");
      } else if (Array.isArray(json.items)) {
        const jsonItemCount = json.items.length;
        if (jsonItemCount !== itemCount) {
          violations.push(
            `feed.json: ${jsonItemCount} item(s) but feed.xml has ${itemCount} item(s)`,
          );
        }
      }
    } catch (err) {
      violations.push(`feed.json: invalid JSON — ${(err as Error).message}`);
    }
  }

  if (violations.length > 0) {
    return failResult("feed.validate", violations);
  }
  return { exitCode: 0, summary: `feed.validate: ok (${itemCount} item(s))` };
}
