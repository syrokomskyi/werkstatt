/*
<MODULE_CONTRACT>
<purpose>
RFC-0803: shared deployment-gating utility. Returns pageIds excluded from
production builds. This module is intentionally free of astro:content imports
so it can be loaded by ecosystem.commit and other non-Vite contexts.
</purpose>
<non-goals>
  <item>Do not import astro:content or any Astro virtual module.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0803: Initial creation.</item>
</CHANGE_SUMMARY>
*/

/**
 * RFC-0803: Reads system.md pages[] and returns pageIds where
 * deployment.production === false. Returns an empty set when
 * process.env.NODE_ENV is not "production" (dev mode) — all pages
 * are visible in dev.
 */
export function collectGatedPageIds(
  pages: Array<{ pageId?: string; deployment?: { production?: boolean } }>,
): Set<string> {
  if (process.env.NODE_ENV !== "production") {
    return new Set();
  }
  const gated = new Set<string>();
  for (const page of pages) {
    if (page.pageId && page.deployment?.production === false) {
      gated.add(page.pageId);
    }
  }
  return gated;
}
