/*
<MODULE_CONTRACT>
<purpose>RFC-0624: CDN cache purge helpers for Leitstand commands — collects URLs from behavior snapshot and purges them via Cloudflare API.</purpose>
<non-goals>
  <item>Do not add purge logic to the adapter — purge is at the command level.</item>
  <item>Do not purge zone-level — only URL-level purge is supported.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0624: initial cache-purge helpers — collectPurgeUrls, purgeCacheByUrls with internal batching (max 30 per API call).</item>
</CHANGE_SUMMARY>
*/

import type { RouteFact, PurgeResult } from "@warpgogol/ontology/operations";

export const BUILD_IDENTITY_PATH = "/.well-known/build-identity.json";
const MAX_URLS_PER_BATCH = 30;

export function collectPurgeUrls(deploymentUrl: string, routes: RouteFact[]): string[] {
  const base = deploymentUrl.replace(/\/$/, "");
  const urls = routes.map((route) => `${base}${route.path}`);
  urls.push(`${base}${BUILD_IDENTITY_PATH}`);
  return urls;
}

export async function purgeCacheByUrls(
  zoneId: string,
  apiToken: string,
  urls: string[],
): Promise<PurgeResult> {
  if (urls.length === 0) {
    return { success: true, purgedUrls: 0 };
  }

  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_BATCH) {
    batches.push(urls.slice(i, i + MAX_URLS_PER_BATCH));
  }

  let totalPurged = 0;

  for (const batch of batches) {
    let response: Response;
    try {
      response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: batch }),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        purgedUrls: totalPurged,
        error: `Network error during purge: ${error}`,
      };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      return {
        success: false,
        purgedUrls: totalPurged,
        error: `Cloudflare purge API returned ${response.status}: ${errorText}`,
      };
    }

    totalPurged += batch.length;
  }

  return { success: true, purgedUrls: totalPurged };
}

export function skippedPurgeResult(reason: string): PurgeResult {
  return { success: false, purgedUrls: 0, error: reason };
}
