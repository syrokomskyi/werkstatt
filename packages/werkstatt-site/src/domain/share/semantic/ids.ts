/*
<MODULE_CONTRACT>
<purpose>URL transformations and semantic ID generation for structured data. Framework-agnostic — used across all Warpgogol apps.</purpose>
<non-goals>
  <item>Do not perform raw URL parsing beyond basic structure validation.</item>
  <item>Do not manage application configuration or external service interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Moved from app semantic/ids to packages/share/src/semantic/ids.ts — framework-agnostic, reusable across all apps.</item>
</CHANGE_SUMMARY>
*/

export function getBaseUrl(url: URL | string): string {
  const resolvedUrl = new URL(typeof url === "string" ? url : url.toString());
  return resolvedUrl.origin;
}

export function toCanonicalUrl(url: URL | string): string {
  const resolvedUrl = new URL(typeof url === "string" ? url : url.toString());
  resolvedUrl.search = "";
  resolvedUrl.hash = "";
  return resolvedUrl.toString();
}

export function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

export function toPathname(url: string): string {
  return new URL(url).pathname;
}

export function markdownTwinRelPath(
  pathname: string,
  opts: { supportedLangs: readonly string[] },
): string {
  const p = pathname.replace(/^\/+|\/+$/g, "");
  if (p === "") return "index.md";
  const isLangRoot = !p.includes("/") && opts.supportedLangs.includes(p);
  if (isLangRoot) return `${p}/index.md`;
  return `${p}.md`;
}

export function markdownTwinUrlPath(
  pathname: string,
  opts: { supportedLangs: readonly string[] },
): string {
  return `/${markdownTwinRelPath(pathname, opts)}`;
}

function toIdSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entity"
  );
}

export function createSemanticIds(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  return {
    organization: `${normalizedBaseUrl}/#/schema/organization`,
    website: `${normalizedBaseUrl}/#/schema/website`,
    webpage: (pageUrl: string) => `${toCanonicalUrl(pageUrl)}#/schema/webpage`,
    breadcrumb: (pageUrl: string) => `${toCanonicalUrl(pageUrl)}#/schema/breadcrumb`,
    person: (name: string) => `${normalizedBaseUrl}/#/schema/person/${toIdSegment(name)}`,
    initiative: (name: string) => `${normalizedBaseUrl}/#/schema/initiative/${toIdSegment(name)}`,
    service: (name: string) => `${normalizedBaseUrl}/#/schema/service/${toIdSegment(name)}`,
    faq: (pageUrl: string) => `${toCanonicalUrl(pageUrl)}#/schema/faq`,
  };
}
