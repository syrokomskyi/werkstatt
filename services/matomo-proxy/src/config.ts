/*
<MODULE_CONTRACT>
<purpose>Parse and normalize environment configuration for the RFC-0305 Matomo first-party proxy worker.</purpose>
<non-goals>
  <item>Do not read app system.md or Matomo API tokens.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add proxy environment contract.</item>
  <item>Architecture review: add validateProxyEnv seam — cached per-isolate env validation callable before first request.</item>
</CHANGE_SUMMARY>
*/

export interface MatomoProxyEnv {
  MATOMO_CLOUD_HOST: string;
}

let validatedOrigin: string | null = null;

export function validateProxyEnv(env: MatomoProxyEnv): string {
  if (validatedOrigin !== null) return validatedOrigin;
  const rawHost = env.MATOMO_CLOUD_HOST.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!rawHost || rawHost.includes("/") || rawHost.includes("?") || rawHost.includes("#")) {
    throw new Error("MATOMO_CLOUD_HOST must be a bare host such as example.matomo.cloud");
  }
  validatedOrigin = `https://${rawHost}`;
  return validatedOrigin;
}

export function resolveMatomoOrigin(env: MatomoProxyEnv): string {
  return validateProxyEnv(env);
}
