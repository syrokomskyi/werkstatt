---
id: RFC-0565
title: "DHT Site Registry and Content Placement: S/Kademlia-hardened DHT for site lookups and mirror placement"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - RFC-0354
  - RFC-0558
  - RFC-0561
  - RFC-0562
  - RFC-0563
  - RFC-0564
  - RFC-0566
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-45
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - dht.lookup
    - dht.register
    - dht.placement
    - dht.status
    - dht.node.init
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel
  - packages/ontology
successSignals:
  - "A workshop can look up a site by id via the DHT and receive the workshop endpoint that hosts the site's active mission, plus mirror addresses."
  - "A new site registered via dht.register is discoverable by all other workshops within O(log N) DHT hops."
  - "The DHT routes around a dead workshop (detected by SWIM, RFC-0564) and returns an alternative mirror for the site."
  - "The fleet registry owner field (RFC-0561) is replicated via the DHT, allowing any workshop to verify site ownership without accessing the local registry."
nonGoals:
  - "Do not implement SWIM membership or failure detection — that is RFC-0564 (Layer 2)."
  - "Do not implement git-mesh platform code replication — that is RFC-0563 (Layer 1)."
  - "Do not implement immutable deploy — that is RFC-0566 (Layer 5)."
  - "Do not replace the local fleet registry (systems/registry.yaml) — the DHT is a distributed projection of the registry, not a replacement. The local registry remains the authoritative source for the local workshop."
  - "Do not implement custom routing protocols — this RFC uses S/Kademlia, a well-established DHT protocol."
  - "Do not store site content in the DHT — the DHT stores only site metadata (id, owner, mirrors, workshop endpoint). Site content is in Sternsystem repos (Layer 4)."
  - "Do not store secrets in the DHT — only public site metadata."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0565: DHT Site Registry and Content Placement: S/Kademlia-hardened DHT for site lookups and mirror placement

## Context

DNA-45 (Fleet registry, RFC-0354) established `systems/registry.yaml` as the canonical fleet registry. RFC-0561 added an optional `owner` field to registry entries. Currently, the registry is a single file in the monorepo. If a workshop doesn't have the monorepo, it doesn't have the registry.

RFC-0562 (P2P topology) defined Layer 3 as "DHT Site Registry and Content Placement": S/Kademlia-hardened DHT for site registry lookups and content placement decisions. This RFC specifies how that layer works.

The grilling session (2026-07-27) established that the DHT provides global site lookups ("where is site X?") and content placement decisions ("which workshop should host site X?") without a central registry. The local registry remains authoritative for the local workshop, but the DHT provides cross-workshop discovery.

## Problem

1. **No cross-workshop site discovery.** A workshop that wants to open a mission for site X needs to know which workshop hosts site X. Currently, there is no way to discover this without the local registry. A workshop without the registry cannot find the site.

2. **No content placement.** When a new site is registered, there is no mechanism to decide which workshop should host it. In a single-workshop model, this is trivial. At scale, the network needs to decide placement based on workshop capacity, locality, and load.

3. **Registry is not fault-tolerant.** The local registry is a single file. If the monorepo is lost, the registry is lost. The DHT replicates registry entries across all workshops, providing fault tolerance.

4. **No ownership verification across workshops.** RFC-0561 added the `owner` field to the local registry. But a workshop that doesn't have the local registry cannot verify ownership. The DHT replicates the `owner` field, allowing any workshop to verify ownership.

## Decision

The Werkstatt P2P network uses an **S/Kademlia-hardened DHT** for site registry lookups and content placement. Each workshop runs a DHT node. Site registry entries (id, owner, mirrors, workshop endpoint) are stored in the DHT, keyed by site id. `dht.lookup` resolves a site id to its registry entry. `dht.register` publishes a site entry to the DHT. `dht.placement` decides which workshop should host a new site based on capacity and locality. The local fleet registry (`systems/registry.yaml`) remains the authoritative source for the local workshop — the DHT is a distributed projection.

## Architectural fit

- **DNA-45 (Fleet registry):** The DHT is a distributed projection of the fleet registry. The local `systems/registry.yaml` remains authoritative for the local workshop. `dht.register` publishes local registry entries to the DHT. `dht.lookup` queries the DHT for entries from other workshops.
- **DNA-44 (Sternsystem bundle):** Sternsystem repos are the unit of site content. The DHT stores metadata about where Sternsystem repos are hosted (mirror addresses), not the content itself.
- **RFC-0561 (Site Ownership):** The `owner` field from the local registry is replicated via the DHT. Any workshop can verify site ownership by looking up the DHT entry.
- **RFC-0562 (P2P topology):** This RFC implements Layer 3 of the five-layer architecture. It depends on Layer 2 (SWIM, RFC-0564) for peer discovery — the DHT needs to know which workshops are alive to route lookups.
- **RFC-0564 (SWIM):** The DHT uses the SWIM membership view to find DHT nodes. Dead workshops (detected by SWIM) are skipped in DHT routing.
- **Scaling:** S/Kademlia DHT lookups are O(log N) hops. At hundred-workshop scale, a lookup takes ~7 hops. At thousand-workshop scale, ~10 hops. Each hop adds ~10ms latency, so lookups are <100ms at thousand-workshop scale. Local caching reduces lookup frequency.

## Design

### CLI surface

```sh
# Look up a site by id in the DHT
pnpm exec site-kernel run dht.lookup --site warpgogol-com --json

# Register a site in the DHT (publishes local registry entry)
pnpm exec site-kernel run dht.register --site warpgogol-com --json

# Decide placement for a new site
pnpm exec site-kernel run dht.placement --site new-site --json

# Check DHT node status
pnpm exec site-kernel run dht.status --json

# Initialize DHT config (creates werkstatt.dht.json)
pnpm exec site-kernel run dht.node.init --bind 0.0.0.0:7947 --bootstrap 10.0.0.1:7947 --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/dht/types.ts

export interface DHTSiteEntry {
  siteId: string;            // Sternsystem id (kebab-case)
  owner: string;             // VC subject id (from RFC-0561)
  workshopEndpoint: string;  // host:port of the workshop hosting the active mission
  mirrors: string[];         // git remote URLs for Sternsystem repo mirrors
  registeredAt: string;      // ISO-8601
  lastUpdated: string;       // ISO-8601
  signature: string;         // Ed25519 signature by the registering workshop
}

export interface DHTConfig {
  bindAddr: string;          // e.g., "0.0.0.0:7947"
  bootstrapNodes: string[];  // DHT bootstrap nodes (usually same as SWIM seeds)
  replicationFactor: number; // default 5 — number of DHT nodes storing each entry
  lookupTimeoutMs: number;   // default 5000
}

export interface DHTLookupResult {
  found: boolean;
  entry?: DHTSiteEntry;
  hops: number;              // DHT hops to resolve
  latencyMs: number;         // total lookup latency
}

export type DHTPlacementReason =
  | "least-loaded"
  | "nearest"
  | "owner-preference"
  | "local-fallback";     // SWIM capacity metrics unavailable

export interface DHTPlacementResult {
  siteId: string;
  assignedWorkshop: string;  // workshop endpoint
  reason: DHTPlacementReason;
  capacity: WorkshopCapacity;
}

export interface WorkshopCapacity {
  workshopId: string;
  endpoint: string;
  activeMissions: number;
  maxMissions: number;
  cpuLoad: number;           // 0-1
  diskFree: number;          // bytes
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/dht/` | New directory. `node.ts`, `lookup.ts`, `register.ts`, `placement.ts`, `types.ts`, `init.ts` modules. Runtime logic: DHT node lifecycle (embedded in CLI), lookup, register, placement, config initialization. |
| `packages/ontology/src/operations/dht.ts` | New file. Zod schemas for `DHTSiteEntry`, `DHTConfig`, `WorkshopCapacity`, `DHTPlacementResult`. Operations schemas alongside existing `fleetRegistryEntrySchema` (DNA-45). Consumed via `@warpgogol/ontology/operations`. |
| `werkstatt.dht.json` | DHT configuration file. Bind address, bootstrap nodes, replication factor, timeouts. Created by `dht.node.init` (this RFC). `werkstatt.network.bootstrap` (RFC-0562) may call `dht.node.init` as part of full network bootstrap, but the DHT RFC owns the command. |
| `systems/registry.yaml` | Local fleet registry remains authoritative. `dht.register` reads from this and publishes to the DHT. |

### Output format

```json
{
  "command": "dht.lookup",
  "status": "ok",
  "data": {
    "found": true,
    "entry": {
      "siteId": "warpgogol-com",
      "owner": "did:web:warpgogol.com#operator-v1",
      "workshopEndpoint": "10.0.0.1:7946",
      "mirrors": ["https://github.com/org/warpgogol-com.git", "git@10.0.0.2:/repos/warpgogol-com.git"],
      "registeredAt": "2026-07-27T10:00:00Z",
      "lastUpdated": "2026-07-27T11:30:00Z",
      "signature": "base64-ed25519..."
    },
    "hops": 3,
    "latencyMs": 35
  },
  "summary": "dht.lookup: found warpgogol-com in 3 hops (35ms)"
}
```

### Failure modes

| Condition | Exit code | Behavior |
| --- | --- | --- |
| Site not in DHT | 0 | `dht.lookup` returns `found: false` with exit 0. Workshop may need to register the site or contact the owner. |
| DHT node unreachable (dead workshop) | 0 | S/Kademlia routes around dead nodes using disjoint paths. Lookup succeeds via alternative paths. |
| All DHT nodes for a key are dead | 1 | `dht.lookup` fails with `key-unavailable` error. The site entry is temporarily unavailable until nodes recover. |
| DHT entry signature invalid | 0 (warn) | `dht.lookup` returns the entry but marks it as `signature-invalid`. The operator decides whether to trust it. Exit 0 because data was found; the signature warning is advisory. |
| Network partition | 0 | Each partition maintains its own DHT view. Entries registered in one partition are not visible in the other. On reunion, DHT converges. |
| Bootstrap node unavailable | 1 | `dht.register` fails with `bootstrap-unreachable` error. Operator must provide a reachable bootstrap node. |
| SWIM capacity metrics unavailable | 0 | `dht.placement` falls back to local placement with `reason: "local-fallback"`. The current workshop hosts the site. |
| Concurrent registration conflict | 0 | Last-write-wins (LWW) based on `lastUpdated` timestamp. If timestamps are equal, the entry whose `owner` matches the `SiteOwnershipCredential` subject (RFC-0558) wins. See Concurrent registration below. |

### Node lifecycle

The DHT node is **embedded in the CLI** — each `dht.*` command starts a temporary DHT node for the duration of the call. The node bootstraps, performs the operation (lookup, register, placement), and shuts down. This simplifies the pilot by avoiding a long-running daemon process. At scale (Phase 4), a persistent daemon mode may be introduced to avoid repeated bootstrap overhead.

`dht.node.init` creates the `werkstatt.dht.json` config file with bind address, bootstrap nodes, replication factor, and timeouts. It is run once per workshop. `werkstatt.network.bootstrap` (RFC-0562) may invoke `dht.node.init` as part of full network bootstrap, but the command is owned by this RFC.

### Implementation library

The DHT uses [`@libp2p/kad-dht`](https://github.com/libp2p/js-libp2p-kad-dht) as the base Kademlia implementation, with a TypeScript wrapper that adds S/Kademlia hardening: Sybil-resistant node id generation (proof-of-work), disjoint lookup paths, and signed entry storage. The wrapper lives in `packages/os/site-kernel/src/dht/`. No custom routing protocol is implemented — the wrapper extends the existing Kademlia routing with S/Kademlia security features.

### Concurrent registration

When two workshops concurrently `dht.register` the same site id with different `workshopEndpoint` values, S/Kademlia's eventual consistency means both entries may exist briefly on different replicas. Conflict resolution is **last-write-wins (LWW)** based on the `lastUpdated` timestamp:

1. The entry with the latest `lastUpdated` timestamp wins.
2. If timestamps are equal, the entry whose `owner` field matches the `SiteOwnershipCredential` subject (RFC-0558) wins — only the verified owner can assert authoritative placement.
3. Stale entries are evicted after the TTL (default 15 minutes).

### Cache invalidation

Phase 3 introduces local caching of DHT lookup results. Cache invalidation works as follows:

- **TTL-based:** Cached entries expire after a configurable TTL (default 5 minutes). After expiry, the next `dht.lookup` fetches a fresh entry from the DHT.
- **Re-registration push:** When `dht.register` updates an entry, the registering workshop sends a cache-invalidation message to workshops it has interacted with recently. This is best-effort — if the message is lost, TTL expiry ensures eventual consistency.
- **Dead workshop detection:** If SWIM (RFC-0564) marks a workshop as dead, cached entries pointing to that workshop's endpoint are immediately invalidated. The next `dht.lookup` fetches a fresh entry that routes to an alternative mirror.

### dht.register cost

Registration involves storing the entry on K replication nodes. The cost is O(log N) DHT hops to reach the responsible nodes, plus O(K) store operations. At thousand-workshop scale, this is ~10 hops × ~10ms + 5 stores × ~10ms ≈ ~150ms. Registration is less frequent than lookups (only on site creation or update), so the higher cost is acceptable.

### Compass and AGENTS.md synchronization

- **`docs/technology.xml`** — add the DHT layer (Layer 3) to the technology inventory.
- **`docs/development-plan.xml`** — add DHT-related development milestones.
- **`packages/os/site-kernel/AGENTS.md`** — add rules for DHT module conventions: Ed25519 signing requirements, config file location, SWIM integration for dead-node skipping, and the `@libp2p/kad-dht` dependency.

## Rollout

- **Phase 1 (single workshop):** No DHT active. The local registry is the only source of site metadata. `dht.lookup` returns `found: false` for all sites. `dht.register` is a no-op — it reads the local registry but does not publish to the DHT (no other workshops to replicate to). `dht.placement` returns `reason: "local-fallback"` (the current workshop hosts the site). `dht.node.init` creates the config file but the DHT node has no peers.
- **Phase 2 (two workshops):** DHT bootstrap with two nodes. `dht.register` publishes local entries to the DHT. `dht.lookup` resolves sites from the other workshop. Replication factor is 2 (both nodes store all entries).
- **Phase 3 (caching):** Workshops cache DHT lookup results locally. Cache TTL is configurable (default 5 minutes). Cached entries are used for subsequent lookups, reducing DHT traffic. See Cache invalidation above for re-registration and dead-workshop handling.
- **Phase 4 (scale):** Hundreds of workshops. S/Kademlia's disjoint paths and Sybil resistance are tested. Replication factor is increased to 5–10 for fault tolerance. Content placement uses capacity metrics from SWIM. A persistent daemon mode may be introduced to avoid repeated bootstrap overhead.

## Alternatives considered

1. **Centralized registry service.** A central service stores all site metadata. Rejected: single point of failure. If the service is down, no workshop can discover sites.
2. **Gossip-based registry replication.** Replicate the registry via gossip (like SWIM). Rejected: gossip is O(N) per round for all entries. DHT is O(log N) for a specific lookup. For million-site scale, DHT is more efficient.
3. **DNS-based discovery.** Use DNS records for site discovery. Rejected: DNS is hierarchical and relies on registrars. The DHT is decentralized and does not require DNS infrastructure.
4. **Blockchain-based registry.** Store site metadata on a blockchain. Rejected: blockchain is overkill for the pilot. S/Kademlia provides sufficient security with lower operational overhead.
5. **No DHT (local registry only).** Each workshop maintains its own registry and syncs via git-mesh. Rejected: at million-site scale, the registry is too large for every workshop to store locally. The DHT distributes the registry across workshops.

## Risks

- **Lookup latency.** DHT lookups add O(log N) hops. At thousand-workshop scale, this is ~10 hops × ~10ms = ~100ms. Mitigation: local caching with TTL reduces lookup frequency. Hot sites (frequently accessed) are cached.
- **Stale entries.** A DHT entry may be stale if the workshop that registered it has since moved the site. Mitigation: entries have `lastUpdated` timestamp. Workshops re-register periodically (default every 5 minutes). Stale entries are evicted after a TTL (default 15 minutes).
- **Sybil attacks.** S/Kademlia's Sybil resistance requires node ids to be generated from public keys (proof of work). In the pilot, membership is permissioned (seed node invitation), so Sybil attacks are not a concern. Future: open membership requires Sybil resistance.
- **Eclipse attacks.** An attacker surrounds a node with malicious peers to isolate it. Mitigation: S/Kademlia uses disjoint paths for lookups, making eclipse attacks difficult.
- **DHT entry integrity.** A malicious workshop could publish a fake DHT entry for a site it doesn't own. Mitigation: DHT entries are signed by the registering workshop. The `owner` field is verified against the VC (RFC-0558). A workshop that doesn't own the site cannot produce a valid signature for the owner.
- **Agent misinterpretation.** LLM agents may attempt to manually edit DHT entries. Mitigation: DHT entries are signed and stored in the DHT, not in a local file. Agents use `dht.register` to publish entries, not manual edits.

## Acceptance criteria

- [ ] `DHTSiteEntry`, `DHTConfig`, `DHTLookupResult`, `DHTPlacementResult`, `WorkshopCapacity` types defined in `packages/os/site-kernel/src/dht/types.ts` with corresponding Zod schemas in `packages/ontology/src/operations/dht.ts`
- [ ] `dht.lookup` command resolves a site id to its DHT entry
- [ ] `dht.register` command publishes a local registry entry to the DHT
- [ ] `dht.placement` command decides which workshop should host a new site
- [ ] `dht.status` command reports local DHT node status
- [ ] `dht.node.init` command creates `werkstatt.dht.json` config file
- [ ] `werkstatt.dht.json` config file schema defined and validated
- [ ] DHT entries are signed with Ed25519 by the registering workshop (keypair from `identity.bootstrap`, RFC-0558)
- [ ] DHT entries include `owner` field from RFC-0561 (depends on RFC-0561 being implemented first)
- [ ] `dht.lookup` routes around dead workshops (detected by SWIM, RFC-0564)
- [ ] Local caching of DHT lookup results with configurable TTL
- [ ] `dht.placement` falls back to `reason: "local-fallback"` when SWIM capacity metrics are unavailable
- [ ] Concurrent registration conflicts resolved via LWW on `lastUpdated` timestamp with owner-signature priority for equal timestamps
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT store secrets in DHT entries — only public site metadata (id, owner, mirrors, endpoint).
- Agents MUST NOT replace the local fleet registry with the DHT — the local registry is authoritative. The DHT is a distributed projection.
- DHT entries MUST be signed with Ed25519 by the registering workshop. Unsigned entries are rejected by `dht.lookup`. The keypair comes from `identity.bootstrap` (RFC-0558) — the same keypair used for VC signing.
- `dht.placement` MUST consider workshop capacity (active missions, CPU load, disk space) when deciding placement.
- The DHT node MUST skip workshops marked as dead by SWIM (RFC-0564) when routing lookups.
- The DHT implementation MUST use `@libp2p/kad-dht` as the base Kademlia layer, with a TypeScript wrapper for S/Kademlia hardening. No custom routing protocol.
- The DHT node lifecycle is embedded in the CLI — each command starts a temporary node. No daemon process in the pilot.
- `dht.node.init` is owned by this RFC. `werkstatt.network.bootstrap` (RFC-0562) may invoke it, but the command definition lives here.
