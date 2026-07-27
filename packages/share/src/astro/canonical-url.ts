/*
<MODULE_CONTRACT>
<purpose>
RFC-0317: one canonical URL builder used by sitemap, feed, llms, Markdown twins,
agent surface URLs, and HTML canonical tags. Ensures byte-identical URLs across
all public surfaces for the same page.
</purpose>
<non-goals>
  <item>Do not read system.md or content collections — pure function only.</item>
  <item>Do not hand-concatenate locale prefixes or trailing slashes outside this helper.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0317: initial implementation — unifies sitemap, feed, llms, and twin URL generation.</item>
</CHANGE_SUMMARY>
*/

import { localizeUrl } from "./url-policy.ts";

export interface CanonicalUrlOptions {
  baseUrl: string;
  defaultLanguage: string;
  supportedLanguages: readonly string[];
  trailingSlash: "always";
}

export interface CanonicalPageUrlInput {
  lang: string;
  route: string;
  kind: "html" | "markdownTwin" | "staticArtifact";
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function ensureTrailingSlash(path: string): string {
  if (path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * RFC-0317: build an absolute canonical URL for a page or static artifact.
 *
 * - HTML routes: default language unprefixed, non-default prefixed, trailing slash.
 * - Markdown twins: same path as HTML (the twin file extension is handled by the caller).
 * - Static artifacts: never language-prefixed, no trailing slash added to the path.
 *
 * The root URL is `https://example.com/`, not `https://example.com/de/`.
 */
export function canonicalPageUrl(input: CanonicalPageUrlInput, opts: CanonicalUrlOptions): string {
  const base = normalizeBase(opts.baseUrl);

  if (input.kind === "staticArtifact") {
    const cleanRoute = input.route.replace(/^\/+/, "");
    return cleanRoute === "" ? `${base}/` : `${base}/${cleanRoute}`;
  }

  const path = localizeUrl(input.lang, input.route, {
    defaultLanguage: opts.defaultLanguage,
  });

  if (opts.trailingSlash === "always") {
    return `${base}${ensureTrailingSlash(path)}`;
  }
  return `${base}${path}`;
}

/**
 * RFC-0317: build an absolute canonical URL for a static artifact (feed.xml,
 * llms.txt, .well-known/agent.json, etc.). Never language-prefixed.
 */
export function canonicalStaticUrl(
  artifactPath: string,
  opts: Pick<CanonicalUrlOptions, "baseUrl">,
): string {
  const base = normalizeBase(opts.baseUrl);
  const clean = artifactPath.replace(/^\/+/, "");
  return clean === "" ? `${base}/` : `${base}/${clean}`;
}
