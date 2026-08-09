/*
<MODULE_CONTRACT>
<purpose>App-agnostic _redirects file parsing for reuse across site-kernel-checks and site-kernel-handoff (RFC-0588).</purpose>
<non-goals>
  <item>Do not handle advanced Cloudflare Pages syntax (query parameters, placeholders) — only whitespace-delimited `from to status` lines.</item>
  <item>Do not perform glob-to-regex conversion — that is the consumer's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0588: extracted parseRedirectRules and RedirectRule from site-kernel-checks/managed-public.ts into @warpgogol/werkstatt-site/share/redirects subpath.</item>
  <item>RFC-0595: add extractRedirectTarget helper for parsing url= from meta-refresh tags.</item>
</CHANGE_SUMMARY>
*/

export type RedirectRule = {
  from: string;
  to: string | undefined;
  status: number;
  line: string;
};

export function parseRedirectRules(body: string): RedirectRule[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [from, to, statusRaw] = line.split(/\s+/);
      return {
        from: from ?? "",
        to,
        status: Number(statusRaw ?? 301),
        line,
      };
    })
    .filter((rule) => rule.from.length > 0);
}

/**
 * Extract the redirect target URL from a `<meta http-equiv="refresh" content="0;url=...">` tag.
 * Returns the immediate target only (first hop). Returns null if the tag is
 * absent or the url= value cannot be parsed.
 */
export function extractRedirectTarget(html: string): string | null {
  const m = html.match(
    /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["']\s*\d+\s*;\s*url=([^"']+)['"][^>]*>/i,
  );
  if (m?.[1]) return m[1].trim();
  const m2 = html.match(
    /<meta[^>]+content=["']\s*\d+\s*;\s*url=([^"']+)['"][^>]*http-equiv=["']refresh["'][^>]*>/i,
  );
  if (m2?.[1]) return m2[1].trim();
  return null;
}
