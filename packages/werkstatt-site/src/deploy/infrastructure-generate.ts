/*
<MODULE_CONTRACT>
<purpose>RFC-0180: resolve a site's integration infrastructure from its declared region/tier and emit
the generated `integration.shard.yaml` record. Pure + offline: it computes the ShardAssignment via
resolveShard (RFC-0179) and the secret names a site needs — no network, no Cloudflare calls (those
live in the separate provision step). This is the agent-safe, build.check-safe half of RFC-0180.</purpose>
<non-goals>
  <item>Do not create Cloudflare resources or call wrangler — that is integration.infrastructure.provision.</item>
  <item>Do not emit queue/KV bindings into a tenant wrangler.jsonc — tenants speak HTTP only (RFC-0179).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0180: initial implementation (generate half; provision/export are separate, credentialed steps).</item>
</CHANGE_SUMMARY>
*/

import { stringify as yamlStringify } from "yaml";
import {
  DESTINATION_ADAPTER_SECRETS,
  resolveShard,
  type DeliveryRegion,
  type DeliveryTier,
  type ShardAssignment,
} from "@warpgogol/integration";

/** A declared destination from system.md integrations.destinations[]. */
export interface DeclaredDestination {
  kind: string;
  vendor: string;
  mode?: "gogol-adapter" | "vendor-native";
}

export interface ComputeInfrastructureInput {
  siteId: string;
  region: DeliveryRegion;
  tier: DeliveryTier;
  /** Whether any inbound source (e.g. uchat) is enabled — implies the inbound secret. */
  inboundEnabled: boolean;
  destinations: readonly DeclaredDestination[];
  /** Shared ingest Worker URL the tenant posts events to (shared backbone, RFC-0179). */
  ingestEndpoint?: string;
  /** Size of the region's shared pool (RFC-0179). */
  shardCount?: number;
}

/** Resolved, generated record of a site's place on the shared backbone (RFC-0180). */
export interface SiteInfrastructure {
  siteId: string;
  shard: ShardAssignment;
  inboundRoute: string;
  ingestEndpoint: string;
  /** Secret NAMES the tenant needs (never values), deduped + sorted. */
  requiredSecrets: string[];
}

const INBOUND_SECRET = "INTEGRATION_INBOUND_SECRET";
const DEFAULT_INGEST = "https://ingest.gogol.workers.dev/api/integration-inbound";

/**
 * Pure resolver (RFC-0180): from a site's declared region/tier/destinations,
 * compute its ShardAssignment (RFC-0179) and the set of secret NAMES it needs.
 * gogol-adapter destinations contribute their adapter's required secrets;
 * vendor-native destinations contribute none. An enabled inbound source adds the
 * inbound webhook secret.
 */
export function computeSiteInfrastructure(input: ComputeInfrastructureInput): SiteInfrastructure {
  const shard = resolveShard(input.siteId, input.region, {
    tier: input.tier,
    shardCount: input.shardCount,
  });

  const secrets = new Set<string>();
  if (input.inboundEnabled) secrets.add(INBOUND_SECRET);
  for (const dest of input.destinations) {
    if ((dest.mode ?? "gogol-adapter") !== "gogol-adapter") continue;
    const required = DESTINATION_ADAPTER_SECRETS[`${dest.kind}:${dest.vendor}`];
    for (const name of required ?? []) secrets.add(name);
  }

  return {
    siteId: input.siteId,
    shard,
    inboundRoute: "/api/integration-inbound",
    ingestEndpoint: input.ingestEndpoint ?? DEFAULT_INGEST,
    requiredSecrets: [...secrets].sort(),
  };
}

/** Canonical, stable YAML text for `apps/<app>/integration.shard.yaml` (RFC-0180). */
export function renderShardRecord(infra: SiteInfrastructure): string {
  return `${yamlStringify(infra)}`;
}
