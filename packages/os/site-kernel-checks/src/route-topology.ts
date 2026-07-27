/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0160] route.topology.validate — guards the unprefixed-default-language
  routing contract. The default language is served WITHOUT a URL prefix (`/`,
  `/<slug>`); only non-default languages are prefixed (`/<lang>/…`). This
  validator enforces that the route files and the route registry agree on that
  topology and that the two URL spaces can never collide.
</purpose>
<non-goals>
  <item>Do not run a browser or fetch the live site — this is a static check.</item>
  <item>Do not validate sitemap/hreflang symmetry — owned by sitemap.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0160: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { localizeUrl } from "@gogol/share/url-policy";
import { resultFromViolations } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

const COMMAND = "route.topology.validate";

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function runRouteTopologyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.srcDirectory, "content");
  const { manifest } = await loadSystemManifest(contentDir);

  const i18n = (manifest.i18n as { default?: string; supported?: Record<string, unknown> }) ?? {};
  const defaultLanguage = defaultLanguageFromManifest(manifest);
  const supportedLanguages = Object.keys(i18n.supported ?? { [defaultLanguage]: true });
  const pages = (manifest.pages ?? []) as Array<{
    pageId?: string;
    routes?: Record<string, string>;
  }>;

  const violations: string[] = [];

  // RT-01: a default-language slug must never equal a supported language code,
  // otherwise `/<slug>` would shadow the `/<lang>/` tree.
  for (const page of pages) {
    const slug = page.routes?.[defaultLanguage];
    if (slug && supportedLanguages.includes(slug)) {
      violations.push(
        `[system.md] RT-01: page "${page.pageId}" has default-language slug "${slug}" which ` +
          `collides with a supported language code. The unprefixed URL "/${slug}" would shadow ` +
          `the "/${slug}/" language tree. Rename the slug (RFC-0160).`,
      );
    }
  }

  // RT-03: no default-language URL may begin with `/<defaultLang>/`.
  for (const page of pages) {
    const slug = page.routes?.[defaultLanguage];
    if (slug === undefined) continue;
    const url = localizeUrl(defaultLanguage, slug, { defaultLanguage });
    if (url === `/${defaultLanguage}` || url.startsWith(`/${defaultLanguage}/`)) {
      violations.push(
        `[system.md] RT-03: default-language URL "${url}" for page "${page.pageId}" is prefixed ` +
          `with "/${defaultLanguage}/". The default language must be unprefixed (RFC-0160).`,
      );
    }
  }

  // RT-02: the three route files exist and use the correct static-path seams.
  const indexPath = join(paths.srcDirectory, "pages", "index.astro");
  const defaultSlugPath = join(paths.srcDirectory, "pages", "[...slug].astro");
  const prefixedPath = join(paths.srcDirectory, "pages", "[lang]", "[...slug].astro");

  const index = await readFileSafe(indexPath);
  const defaultSlug = await readFileSafe(defaultSlugPath);
  const prefixed = await readFileSafe(prefixedPath);

  if (index === null) {
    violations.push(`RT-02: missing root route ${indexPath}. Run routes.generate.`);
  } else if (!index.includes("resolvePageRoute")) {
    violations.push(`[index.astro] RT-02: root page must render the home via resolvePageRoute().`);
  }

  if (defaultSlug === null) {
    violations.push(
      `RT-02: missing unprefixed default-language route ${defaultSlugPath}. Run routes.generate.`,
    );
  } else if (!defaultSlug.includes("getStaticPathsForDefaultLang")) {
    violations.push(
      `[[...slug].astro] RT-02: default-language route must use getStaticPathsForDefaultLang() (RFC-0160).`,
    );
  }

  if (prefixed === null) {
    violations.push(`RT-02: missing prefixed route ${prefixedPath}. Run routes.generate.`);
  } else if (
    !prefixed.includes("getStaticPathsForPrefixedLangs") ||
    !prefixed.includes("getStaticPathsForDefaultLangRedirects")
  ) {
    violations.push(
      `[[lang]/[...slug].astro] RT-02: prefixed route must use getStaticPathsForPrefixedLangs() ` +
        `and getStaticPathsForDefaultLangRedirects() (RFC-0160).`,
    );
  }

  return resultFromViolations(COMMAND, violations);
}
