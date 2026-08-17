/*
<MODULE_CONTRACT>
<purpose>RFC-0179: deterministic placement of a site on the shared, sharded delivery backbone.
resolveShard maps a stable siteId + region + tier onto a concrete queue / DLQ / dedup-namespace
set, so the shared queues replace RFC-0176's per-client queue without a central registry — the
mapping is recomputable from content alone. Pure: no I/O, no platform bindings.</purpose>
<non-goals>
  <item>Do not create or call Cloudflare resources — this is a pure naming/placement function.</item>
  <item>Do not read system.md or any file — callers pass region/tier explicitly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0179: initial implementation.</item>
  <item>RFC-0181: the Cloudflare-queue naming here is SUPERSEDED for the EU delivery path (Upstash QStash/Redis, see qstash.ts). Retained for the deferred WfP/CF-hosted topology; not used for EU lead delivery.</item>
</CHANGE_SUMMARY>
*/

/** Closed catalog of delivery jurisdictions (RFC-0179). Drives residency sharding. */
export const DELIVERY_REGIONS = ["eu", "us"] as const;
export type DeliveryRegion = (typeof DELIVERY_REGIONS)[number];

/** Execution tier on the shared backbone (RFC-0179). */
export const DELIVERY_TIERS = ["shared", "dedicated"] as const;
export type DeliveryTier = (typeof DELIVERY_TIERS)[number];

/** Resolved placement of a site on the shared delivery backbone (RFC-0179). */
export interface ShardAssignment {
  siteId: string;
  region: DeliveryRegion;
  tier: DeliveryTier;
  /** Shared-pool shard index, or -1 for a dedicated queue. */
  shardIndex: number;
  /** Queue name, e.g. "gogol-int-eu-shared-02" or "gogol-int-eu-ded-acme". */
  queue: string;
  /** Dead-letter queue name (queue + "-dlq"). */
  dlq: string;
  /** Region dedup KV namespace title, e.g. "gogol-int-dedup-eu". */
  dedupNamespace: string;
  /** Consumer Worker name bound to `queue` (one consumer per queue). */
  consumer: string;
}

/** Options for resolveShard. `shardCount` is the size of the region's shared pool. */
export interface ResolveShardOptions {
  tier?: DeliveryTier;
  /** Number of queues in the region's shared pool. Must be ≥ 1. Default 4. */
  shardCount?: number;
}

/**
 * Deterministic 32-bit FNV-1a hash of a string. Stable across runtimes (no
 * dependency on Math.random or hash seeds), so a siteId always lands on the same
 * shard — the property re-sharding safety and registry-free placement rely on.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit unsigned space.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Two-digit shard suffix ("00".."99"+) for stable, sortable queue names. */
function shardSuffix(index: number): string {
  return index < 10 ? `0${index}` : String(index);
}

/**
 * Sanitize a siteId into a Cloudflare-safe resource-name segment: lowercase,
 * alphanumeric + single dashes. Keeps names deterministic for dedicated queues.
 */
function safeSegment(siteId: string): string {
  return siteId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Resolve a site's place on the shared, sharded delivery backbone (RFC-0179).
 *
 * - `shared` tier: the site is hashed into one of `shardCount` queues in the
 *   region's shared pool — `gogol-int-{region}-shared-{NN}`. Blast radius is
 *   bounded to 1/shardCount of the pool.
 * - `dedicated` tier: the site gets its own queue `gogol-int-{region}-ded-{siteId}`
 *   so a noisy/high-volume client cannot exhaust a shared pool's backlog.
 *
 * Dedup is a single region-scoped KV namespace in both tiers (keys are
 * `{siteId}:{eventId}:{dest}`, unlimited per namespace).
 *
 * Pure + deterministic: the same inputs always yield the same assignment, so the
 * placement is recomputable from content with no central registry.
 */
export function resolveShard(
  siteId: string,
  region: DeliveryRegion,
  opts: ResolveShardOptions = {},
): ShardAssignment {
  if (!siteId) throw new Error("resolveShard: siteId is required");
  const tier: DeliveryTier = opts.tier ?? "shared";
  const shardCount = Math.max(1, opts.shardCount ?? 4);
  const dedupNamespace = `gogol-int-dedup-${region}`;

  if (tier === "dedicated") {
    const queue = `gogol-int-${region}-ded-${safeSegment(siteId)}`;
    return {
      siteId,
      region,
      tier,
      shardIndex: -1,
      queue,
      dlq: `${queue}-dlq`,
      dedupNamespace,
      consumer: `${queue}-consumer`,
    };
  }

  const shardIndex = fnv1a(siteId) % shardCount;
  const queue = `gogol-int-${region}-shared-${shardSuffix(shardIndex)}`;
  return {
    siteId,
    region,
    tier,
    shardIndex,
    queue,
    dlq: `${queue}-dlq`,
    dedupNamespace,
    consumer: `${queue}-consumer`,
  };
}
