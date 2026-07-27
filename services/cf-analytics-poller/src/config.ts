/*
<MODULE_CONTRACT>
<purpose>Load environment configuration required by the CF analytics poller service runtime (RFC-0343).</purpose>
<non-goals>
  <item>Do not query Cloudflare or push observability metrics from configuration loading.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0343: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export interface PollerConfig {
  pollIntervalMs: number;
  cfApiToken: string;
}

function getEnv(key: string): string | undefined {
  const proc = (globalThis as Record<string, unknown>)["process"] as
    { env?: Record<string, string | undefined> } | undefined;
  return proc?.env?.[key];
}

export function loadConfig(): PollerConfig {
  const pollIntervalMs = parseInt(getEnv("POLL_INTERVAL_MS") ?? "300000", 10);
  const cfApiToken = getEnv("CF_ANALYTICS_API_TOKEN") ?? "";
  return { pollIntervalMs, cfApiToken };
}
