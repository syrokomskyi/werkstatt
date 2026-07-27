/*
<MODULE_CONTRACT>
<purpose>Load runtime environment configuration for fleet probe scheduling and request limits (RFC-0341).</purpose>
<non-goals>
  <item>Do not read target manifests or execute HTTP/TLS probes from configuration loading.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0341: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export interface ProbeConfig {
  probeIntervalMs: number;
  concurrency: number;
  requestTimeoutMs: number;
}

function getEnv(key: string): string | undefined {
  const proc = (globalThis as Record<string, unknown>)["process"] as
    { env?: Record<string, string | undefined> } | undefined;
  return proc?.env?.[key];
}

export function loadConfig(): ProbeConfig {
  const probeIntervalMs = parseInt(getEnv("PROBE_INTERVAL_MS") ?? "300000", 10);
  const concurrency = parseInt(getEnv("PROBE_CONCURRENCY") ?? "3", 10);
  const requestTimeoutMs = parseInt(getEnv("PROBE_REQUEST_TIMEOUT_MS") ?? "10000", 10);

  return { probeIntervalMs, concurrency, requestTimeoutMs };
}
