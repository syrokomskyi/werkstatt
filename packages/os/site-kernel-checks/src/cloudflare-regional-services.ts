/*
<MODULE_CONTRACT>
<purpose>
RFC-0182: Cloudflare Regional Services live validation. Queries the Cloudflare API
to verify that declared hostnames are active in allowed Regional Services zones.
Empty allowedZones means all zones acceptable — the API check is skipped with
an explicit pass result. Non-empty allowedZones triggers live validation against
the Cloudflare Regional Services endpoint.
</purpose>
<non-goals>
  <item>Do not provision or mutate Cloudflare Regional Services settings.</item>
  <item>Do not validate Cloudflare KV/Queues — that is cloudflare.residency.validate (RFC-0181).</item>
  <item>Do not hardcode hostnames, zone IDs, or environment variable names.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0182: initial Cloudflare Regional Services live validator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { optionalEnv } from "@gogol/site-kernel-integrity";
import { passResult, failResult, resultFromViolations } from "./result-helpers.ts";

/** Cloudflare Regional Services API response shape (tolerant). */
interface RegionalHostnameEntry {
  hostname?: string;
  host?: string;
  region?: string;
  enabled?: boolean;
  status?: string;
  config?: { region?: string };
  value?: string;
}

/** Normalized state for a hostname. */
interface HostnameState {
  hostname: string;
  enabled: boolean;
  region: string | null;
}

/** Result data structure for JSON output. */
interface ValidationData {
  command: string;
  status: "pass" | "fail" | "skip";
  policy?: {
    appId: string;
    hostnames: string[];
    allowedZones: string[];
  };
  hostnames?: HostnameState[];
  violations?: Array<{
    rule: string;
    hostname?: string;
    expectedRegions?: string[];
    actualRegion?: string | null;
    message: string;
  }>;
}

/** Normalize region from various Cloudflare response shapes. */
function extractRegionFromMatch(match: RegionalHostnameEntry): string | null {
  const raw = match.region ?? match.config?.region ?? match.value ?? null;
  return raw ? String(raw).toLowerCase() : null;
}

/** Determine if the entry represents enabled Regional Services. */
function isEnabled(match: RegionalHostnameEntry): boolean {
  if (match.enabled === true) return true;
  const status = String(match.status ?? "").toLowerCase();
  return status === "active" || status === "enabled";
}

/** Fetch regional hostnames from Cloudflare API. */
async function fetchRegionalHostnames(
  zoneId: string,
  apiToken: string,
): Promise<RegionalHostnameEntry[]> {
  const url = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/addressing/regional_hostnames`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "{}");
    throw new Error(`Cloudflare API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json().catch(() => ({}))) as {
    result?: RegionalHostnameEntry[] | { items?: RegionalHostnameEntry[] };
  };

  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray((data.result as { items?: RegionalHostnameEntry[] })?.items)) {
    return (data.result as { items: RegionalHostnameEntry[] }).items;
  }
  return [];
}

export async function runCloudflareRegionalServicesValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ValidationData>> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const contentDir = join(appDir, "src", "content");

  // Load system manifest
  const manifestResult = await loadSystemManifest(contentDir);
  if (!manifestResult.manifest) {
    return failResult("cloudflare.regional-services.validate", [
      "Unable to load system.md manifest",
    ]) as KernelCommandResult<ValidationData>;
  }
  const manifest = manifestResult.manifest as {
    app?: string;
    identity?: { domain?: string };
    deployment?: {
      cloudflare?: {
        hostnames?: string[];
        regionalServices?: { allowedZones?: string[] };
      };
    };
  };

  const appId = manifest.app ?? "unknown";
  const domain = manifest.identity?.domain;
  const deployment = manifest.deployment?.cloudflare;
  const allowedZones = deployment?.regionalServices?.allowedZones ?? [];
  const declaredHostnames = deployment?.hostnames ?? [];

  // Determine hostnames to validate
  const hostnames = declaredHostnames.length > 0 ? declaredHostnames : domain ? [domain] : [];

  // Empty allowedZones means all zones acceptable — skip API validation
  if (allowedZones.length === 0) {
    const data: ValidationData = {
      command: "cloudflare.regional-services.validate",
      status: "skip",
      policy: { appId, hostnames, allowedZones: [] },
    };
    return {
      data,
      exitCode: 0,
      summary:
        "cloudflare.regional-services.validate: SKIP — empty allowedZones (all zones acceptable)",
    };
  }

  // Require Cloudflare credentials for live validation
  // RFC-0182: prefer CLOUDFLARE_READONLY_API_TOKEN (least-privilege), fallback to CLOUDFLARE_API_TOKEN
  // optionalEnv reads from apps/<id>/.env so per-site credentials work without global env pollution.
  const zoneId =
    (await optionalEnv("CLOUDFLARE_ZONE_ID", appDir)) ?? process.env.CLOUDFLARE_ZONE_ID ?? "";
  const apiToken =
    (await optionalEnv("CLOUDFLARE_READONLY_API_TOKEN", appDir)) ??
    (await optionalEnv("CLOUDFLARE_API_TOKEN", appDir)) ??
    process.env.CLOUDFLARE_READONLY_API_TOKEN ??
    process.env.CLOUDFLARE_API_TOKEN ??
    "";

  if (!zoneId || !apiToken) {
    const violations = [
      {
        rule: "credentials-missing",
        message:
          "CLOUDFLARE_ZONE_ID and CLOUDFLARE_READONLY_API_TOKEN (or CLOUDFLARE_API_TOKEN) are required for live Regional Services validation. " +
          "Set them in apps/<id>/.env or disable strict pipeline mode for local development.",
      },
    ];
    const data: ValidationData = {
      command: "cloudflare.regional-services.validate",
      status: "fail",
      policy: { appId, hostnames, allowedZones },
      violations,
    };
    return {
      data,
      exitCode: 1,
      summary:
        "cloudflare.regional-services.validate: FAIL — Cloudflare credentials missing (CLOUDFLARE_ZONE_ID, CLOUDFLARE_READONLY_API_TOKEN)",
    };
  }

  // Fetch state from Cloudflare API
  let apiEntries: RegionalHostnameEntry[];
  try {
    apiEntries = await fetchRegionalHostnames(zoneId, apiToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const violations = [
      {
        rule: "api-error",
        message: `Cloudflare API request failed: ${msg.slice(0, 200)}`,
      },
    ];
    const data: ValidationData = {
      command: "cloudflare.regional-services.validate",
      status: "fail",
      policy: { appId, hostnames, allowedZones },
      violations,
    };
    return {
      data,
      exitCode: 1,
      summary: `cloudflare.regional-services.validate: FAIL — ${msg.slice(0, 100)}`,
    };
  }

  // Normalize to lookup map
  const byHostname = new Map<string, RegionalHostnameEntry>();
  for (const entry of apiEntries) {
    const hn = String(entry.hostname ?? entry.host ?? "").toLowerCase();
    if (hn) byHostname.set(hn, entry);
  }

  // Validate each hostname
  const normalizedAllowed = allowedZones.map((z) => z.toLowerCase());
  const hostnameStates: HostnameState[] = [];
  const violations: ValidationData["violations"] = [];

  for (const rawHostname of hostnames) {
    const hostname = rawHostname.toLowerCase();
    const match = byHostname.get(hostname);

    if (!match) {
      violations.push({
        rule: "hostname-missing",
        hostname: rawHostname,
        expectedRegions: allowedZones,
        actualRegion: null,
        message: `hostname "${rawHostname}" not found in Regional Services config`,
      });
      hostnameStates.push({ hostname: rawHostname, enabled: false, region: null });
      continue;
    }

    const enabled = isEnabled(match);
    const region = extractRegionFromMatch(match);

    hostnameStates.push({ hostname: rawHostname, enabled, region });

    if (!enabled) {
      violations.push({
        rule: "regional-services-disabled",
        hostname: rawHostname,
        expectedRegions: allowedZones,
        actualRegion: region,
        message: `hostname "${rawHostname}" exists but Regional Services is not enabled`,
      });
      continue;
    }

    if (region && !normalizedAllowed.includes(region)) {
      violations.push({
        rule: "region-not-allowed",
        hostname: rawHostname,
        expectedRegions: allowedZones,
        actualRegion: region,
        message: `hostname "${rawHostname}" is active in region "${region}", expected one of [${allowedZones.join(", ")}]`,
      });
    }
  }

  const data: ValidationData = {
    command: "cloudflare.regional-services.validate",
    status: violations.length > 0 ? "fail" : "pass",
    policy: { appId, hostnames, allowedZones },
    hostnames: hostnameStates,
    violations,
  };

  if (violations.length === 0) {
    return {
      data,
      exitCode: 0,
      summary:
        "cloudflare.regional-services.validate: OK — all hostnames match allowed Regional Services zones",
    };
  }

  return {
    data,
    exitCode: 1,
    summary: `cloudflare.regional-services.validate: FAIL — ${violations.length} violation(s)`,
  };
}
