---
rfcId: RFC-0565
planId: PLAN-RFC-0565-01
status: draft
owner: architecture
createdAt: 2026-07-28
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel
    - packages/ontology
    - packages/passport
  services: []
  docs:
    - packages/os/site-kernel/AGENTS.md
    - docs/technology.xml
    - docs/development-plan.xml
---

# Implementation Plan: RFC-0565

## 1. Objectives

- [ ] O1 — Define DHT TypeScript contracts and Zod schemas (DHTSiteEntry, DHTConfig, DHTLookupResult, DHTPlacementResult, WorkshopCapacity) — maps to acceptance criterion 1
- [ ] O2 — Implement `dht.node.init` command for creating `werkstatt.dht.json` — maps to acceptance criteria 6, 7
- [ ] O3 — Implement `dht.lookup` command with S/Kademlia routing via `@libp2p/kad-dht` — maps to acceptance criterion 2
- [ ] O4 — Implement `dht.register` command that reads local registry and publishes to DHT with Ed25519 signing — maps to acceptance criteria 3, 8, 9
- [ ] O5 — Implement `dht.placement` command with SWIM membership filtering and DHT capacity query, local-fallback when unavailable — maps to acceptance criteria 4, 11
- [ ] O6 — Implement `dht.status` command reporting local DHT node status — maps to acceptance criterion 5
- [ ] O7 — Implement local cache with TTL-based expiry and dead-workshop invalidation — maps to acceptance criteria 10, 12
- [ ] O8 — Implement concurrent registration LWW conflict resolution — maps to acceptance criterion 13
- [ ] O9 — Implement `dht.capacity.publish` command for publishing workshop capacity to DHT — maps to acceptance criterion 11 (capacity metrics for placement)

## 2. Affected artifacts

### 2.1 Code and commands

**New files:**

| Path | Purpose |
| --- | --- |
| `packages/os/site-kernel/src/dht/types.ts` | TypeScript interfaces: `DHTSiteEntry`, `DHTConfig`, `DHTLookupResult`, `DHTPlacementResult`, `DHTPlacementReason`, `WorkshopCapacity`, `DHTCacheEntry` |
| `packages/os/site-kernel/src/dht/config.ts` | Loads/validates `werkstatt.dht.json`, creates default config on `dht.node.init` |
| `packages/os/site-kernel/src/dht/node.ts` | Embedded DHT node lifecycle: start temporary node, bootstrap, perform operation, shutdown. Wraps `@libp2p/kad-dht` with S/Kademlia hardening (Sybil-resistant node id, disjoint paths, signed entry storage) |
| `packages/os/site-kernel/src/dht/lookup.ts` | `dht.lookup` handler: resolve site id to DHT entry, check local cache first, validate signature |
| `packages/os/site-kernel/src/dht/register.ts` | `dht.register` handler: read local registry entry, sign with Ed25519 via `@warpgogol/passport/dht-sign`, publish to DHT |
| `packages/os/site-kernel/src/dht/placement.ts` | `dht.placement` handler: read alive workshops from SWIM genome log, query capacity from DHT (`capacity/<workshopId>` keys), select least-loaded workshop, fall back to local-fallback when SWIM or capacity unavailable |
| `packages/os/site-kernel/src/dht/cache.ts` | Local DHT lookup cache: TTL-based expiry and dead-workshop invalidation via SWIM membership view |
| `packages/os/site-kernel/src/dht/init.ts` | `dht.node.init` handler: create `werkstatt.dht.json` with bind address, bootstrap nodes, replication factor, timeouts |
| `packages/os/site-kernel/src/dht/capacity.ts` | `dht.capacity.publish` handler: read local `werkstatt.capacity.json`, sign with Ed25519, publish `WorkshopCapacity` to DHT under key `capacity/<workshopId>` |
| `packages/os/site-kernel/src/dht/dht-module.ts` | Kernel module registering `dht.lookup`, `dht.register`, `dht.placement`, `dht.status`, `dht.node.init`, `dht.capacity.publish` commands. All `cacheable: false` (depend on external network state) |
| `packages/ontology/src/operations/dht.ts` | Zod schemas: `dhtSiteEntrySchema`, `dhtConfigSchema`, `dhtLookupResultSchema`, `dhtPlacementResultSchema`, `workshopCapacitySchema`. Exported via `@warpgogol/ontology/operations` |
| `packages/passport/src/dht-sign.ts` | RFC-0565: `dhtEntryBytes()`, `signDhtEntry()`, `verifyDhtEntry()` — canonicalization and sign/verify wrappers for DHT site entries, built on `signBytes`/`verifyBytes` from `sign.ts`. Analogous to `identity-sign.ts` but for `DHTSiteEntry` shape |

**Modified files:**

| Path | Change |
| --- | --- |
| `packages/os/site-kernel/src/index.ts` | Export `dhtModule` and DHT types |
| `packages/os/site-kernel/package.json` | Add `@libp2p/kad-dht` and `@libp2p/peer-id` dependencies; add `./dht` and `./dht-module` export paths |
| `packages/ontology/src/operations/index.ts` | Re-export DHT schemas from `./dht.ts` |
| `packages/passport/src/index.ts` | Re-export `dht-sign.ts` functions via `@warpgogol/passport/dht-sign` entry point |
| `packages/passport/package.json` | Add `./dht-sign` export path |
| `tools/kernel.config.ts` | Register `dht` module loader: `dht: async () => (await import("@warpgogol/site-kernel/dht-module")).dhtModule` |

**New commands (all workspace-scoped, `cacheable: false`):**

| Command | Description |
| --- | --- |
| `dht.lookup` | Resolve a site id to its DHT entry. Flags: `--site <id>`, `--json` |
| `dht.register` | Publish a local registry entry to the DHT. Flags: `--site <id>`, `--json` |
| `dht.placement` | Decide which workshop should host a new site. Flags: `--site <id>`, `--json` |
| `dht.status` | Report local DHT node status. Flags: `--json` |
| `dht.node.init` | Create `werkstatt.dht.json` config. Flags: `--bind <addr>`, `--bootstrap <addr>`, `--json` |
| `dht.capacity.publish` | Publish local workshop capacity to DHT. Flags: `--json`. Reads `werkstatt.capacity.json` |

### 2.2 Configuration and data

| Path | Purpose |
| --- | --- |
| `werkstatt.dht.json` | DHT config file (workspace root, gitignored). Created by `dht.node.init`. Contains: `bindAddr`, `bootstrapNodes`, `replicationFactor`, `lookupTimeoutMs`, `cacheTtlMs` |
| `werkstatt.dht.cache.json` | Local DHT lookup cache (workspace root, gitignored). Managed by `cache.ts` |
| `werkstatt.capacity.json` | Local workshop capacity metrics (workspace root, gitignored). Updated by local process or CLI command. Read by `dht.capacity.publish` |
| `systems/registry.yaml` | Read-only by `dht.register` — local fleet registry remains authoritative |

### 2.3 Documentation and specs

| Path | Change |
| --- | --- |
| `packages/os/site-kernel/AGENTS.md` | Add DHT section: module conventions, Ed25519 signing requirements, config file location, SWIM integration for dead-node skipping, `@libp2p/kad-dht` dependency, embedded CLI lifecycle |
| `docs/technology.xml` | Add DHT layer (Layer 3) to technology inventory |
| `docs/development-plan.xml` | Add DHT-related development milestones |

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel build:check` — typecheck after adding DHT module
- `pnpm --filter @warpgogol/ontology build:check` — typecheck after adding DHT schemas
- `pnpm --filter @warpgogol/passport test` — unit tests for dht-sign.ts
- `pnpm exec site-kernel run rfc.validate --id RFC-0565` — RFC validation
- `pnpm exec site-kernel run ecosystem.manifest.generate` — update command manifest after new commands

## 3. Step sequence

### Step 1. DHT Zod schemas in ontology

**Goal:** Define Zod schemas for all DHT types in `packages/ontology/src/operations/dht.ts`.

**Agent actions:**

- Create `packages/ontology/src/operations/dht.ts` with Zod schemas: `dhtSiteEntrySchema`, `dhtConfigSchema`, `dhtLookupResultSchema`, `dhtPlacementResultSchema`, `workshopCapacitySchema`, `dhtPlacementReasonSchema`
- Add re-exports to `packages/ontology/src/operations/index.ts`
- Add `dhtSiteEntrySchema` fields: `siteId` (kebab-case), `owner` (did:web, optional), `workshopEndpoint` (URL), `mirrors` (array of URLs), `registeredAt` (datetime), `lastUpdated` (datetime), `signature` (Ed25519 multibase)
- Add `dhtConfigSchema` fields: `bindAddr`, `bootstrapNodes` (array), `replicationFactor` (default 5), `lookupTimeoutMs` (default 5000), `cacheTtlMs` (default 300000)
- Add `dhtPlacementReasonSchema` as `z.enum(["least-loaded", "nearest", "owner-preference", "local-fallback"])`
- Export corresponding TypeScript types via `z.infer`

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check`

**Completion criterion:** `packages/ontology/src/operations/dht.ts` exists with all 6 schemas, re-exported from `index.ts`, and `build:check` passes.

**Human review:** no

---

### Step 2. DHT TypeScript contracts in site-kernel

**Goal:** Define TypeScript interfaces in `packages/os/site-kernel/src/dht/types.ts` that mirror the Zod schemas.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/types.ts` with interfaces: `DHTSiteEntry`, `DHTConfig`, `DHTLookupResult`, `DHTPlacementResult`, `DHTPlacementReason`, `WorkshopCapacity`, `DHTCacheEntry`
- Import Zod schemas from `@warpgogol/ontology/operations` for runtime validation
- `DHTCacheEntry` adds `cachedAt: string` and `expiresAt: string` to `DHTSiteEntry`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`

**Completion criterion:** `types.ts` exists with all 7 interfaces, `build:check` passes.

**Human review:** no

---

### Step 3. DHT config loader and `dht.node.init` command

**Goal:** Implement config loading and the `dht.node.init` command that creates `werkstatt.dht.json`.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/config.ts`:
  - `loadDhtConfig(workspaceRoot): DHTConfig` — reads and validates `werkstatt.dht.json` with `dhtConfigSchema`
  - `createDhtConfig(workspaceRoot, options): DHTConfig` — creates config with defaults, writes to `werkstatt.dht.json`
- Create `packages/os/site-kernel/src/dht/init.ts`:
  - `runDhtNodeInit` handler — parses `--bind` and `--bootstrap` flags, calls `createDhtConfig`, returns config as JSON
- Create `packages/os/site-kernel/src/dht/dht-module.ts`:
  - Register `dht.node.init` command (workspace scope, `cacheable: false`, `reads: ["werkstatt.identity.json"]`, `writes: ["werkstatt.dht.json"]`)
- Add `./dht` and `./dht-module` export paths to `packages/os/site-kernel/package.json`
- Register `dht` module in `tools/kernel.config.ts`
- Add `@libp2p/kad-dht` and `@libp2p/peer-id` to `packages/os/site-kernel/package.json` dependencies

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm exec site-kernel run dht.node.init --bind 0.0.0.0:7947 --json` — creates `werkstatt.dht.json`

**Completion criterion:** `dht.node.init` command creates a valid `werkstatt.dht.json`, `build:check` passes.

**Human review:** no

---

### Step 4. DHT entry signing module in passport

**Goal:** Implement Ed25519 signing/verification for DHT site entries in `packages/passport/src/dht-sign.ts`.

**Agent actions:**

- Create `packages/passport/src/dht-sign.ts`:
  - `dhtEntryBytes(entry: DHTSiteEntry): Uint8Array` — canonical UTF-8 bytes (sorted-key JSON, no whitespace), analogous to `identityCredentialBytes`
  - `signDhtEntry(entry, privateKeyHex, verificationMethod, signedAt): Promise<VCProof>` — signs DHT entry with Ed25519 using `signBytes` from `sign.ts`
  - `verifyDhtEntry(entry, proof, publicKeyMultibase): Promise<boolean>` — verifies DHT entry signature using `verifyBytes` from `sign.ts`
- Add `./dht-sign` export path to `packages/passport/package.json`
- Re-export from `packages/passport/src/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/passport build:check`

**Completion criterion:** `dht-sign.ts` exists with 3 functions, `build:check` passes.

**Human review:** no

---

### Step 5. Embedded DHT node lifecycle

**Goal:** Implement the embedded DHT node wrapper around `@libp2p/kad-dht` with S/Kademlia hardening.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/node.ts`:
  - `createDhtNode(config, identityConfig)` — creates a temporary libp2p node with KadDHT. S/Kademlia hardening wrapper: PoW for node id generated before libp2p peer creation, disjoint lookup paths via multiple parallel lookups with different starting nodes, signed entry storage at application level
  - `startDhtNode(node)` — bootstraps to configured bootstrap nodes
  - `stopDhtNode(node)` — gracefully shuts down the node
  - `dhtPut(node, key, value)` — stores a value in the DHT with replication
  - `dhtGet(node, key)` — retrieves a value from the DHT with disjoint paths (multiple parallel lookups)
  - Read `werkstatt.identity.json` for operator public key (Sybil-resistant node id generation)
  - Fail with `identity-not-bootstrapped` if identity is not set up (same pattern as SWIM)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`

**Completion criterion:** `node.ts` exists with all 5 functions, `build:check` passes.

**Human review:** no

---

### Step 6. `dht.lookup` command handler

**Goal:** Implement the `dht.lookup` command that resolves a site id to its DHT entry.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/cache.ts`:
  - `getCachedEntry(workspaceRoot, siteId): DHTCacheEntry | null` — returns cached entry if not expired
  - `setCachedEntry(workspaceRoot, siteId, entry, ttlMs)` — stores entry in cache
  - `invalidateCachedEntry(workspaceRoot, siteId)` — removes entry from cache
  - `invalidateDeadWorkshops(workspaceRoot, deadEndpoints)` — removes entries pointing to dead workshops
- Create `packages/os/site-kernel/src/dht/lookup.ts`:
  - `runDhtLookup` handler:
    1. Check local cache first (`getCachedEntry`). If valid cache hit, return cached entry with `cached: true`.
    2. If cache miss, start embedded DHT node (`createDhtNode` + `startDhtNode`)
    3. `dhtGet(node, siteId)` — retrieve entry from DHT
    4. Validate entry signature with `verifyDhtEntry` from `@warpgogol/passport/dht-sign`
    5. If signature invalid, return entry with `signature-invalid: true` (exit 0, advisory warning)
    6. If entry found, cache it (`setCachedEntry`)
    7. Stop DHT node (`stopDhtNode`)
    8. Return `DHTLookupResult` with `found`, `entry`, `hops`, `latencyMs`
- Register `dht.lookup` in `dht-module.ts` (`cacheable: false`, `reads: ["werkstatt.dht.json", "werkstatt.identity.json", "werkstatt.dht.cache.json"]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm --filter @warpgogol/site-kernel test` — unit test: lookup returns `found: false` for unknown site

**Completion criterion:** `dht.lookup` returns `found: false` for unknown sites, returns cached entries on cache hit, validates signatures on DHT entries.

**Human review:** no

---

### Step 7. `dht.register` command handler

**Goal:** Implement the `dht.register` command that publishes a local registry entry to the DHT.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/register.ts`:
  - `runDhtRegister` handler:
    1. Read local fleet registry (`systems/registry.yaml`) to get the site entry
    2. Read `werkstatt.identity.json` for operator keypair
    3. Sign the DHT entry with Ed25519 using `signDhtEntry` from `@warpgogol/passport/dht-sign` (same keypair as VC signing, RFC-0558)
    4. Start embedded DHT node
    5. `dhtPut(node, siteId, signedEntry)` — store entry on K replication nodes
    6. Stop DHT node
    7. Return registered entry with `replicatedTo: number` (count of replication nodes)
  - LWW conflict resolution: if `dhtPut` detects an existing entry with a newer `lastUpdated`, return `conflict: true` with the existing entry. If timestamps are equal, the entry whose `owner` matches the `SiteOwnershipCredential` subject wins.
- Register `dht.register` in `dht-module.ts` (`cacheable: false`, `reads: ["systems/registry.yaml", "werkstatt.identity.json", "werkstatt.dht.json"]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm --filter @warpgogol/site-kernel test` — unit test: register signs entry with Ed25519, LWW conflict resolution

**Completion criterion:** `dht.register` reads local registry, signs entry, publishes to DHT, handles LWW conflicts.

**Human review:** no

---

### Step 8. `dht.capacity.publish` command handler

**Goal:** Implement the `dht.capacity.publish` command that publishes local workshop capacity to the DHT.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/capacity.ts`:
  - `runDhtCapacityPublish` handler:
    1. Read local `werkstatt.capacity.json` (activeMissions, maxMissions, cpuLoad, diskFree)
    2. Read `werkstatt.identity.json` for operator keypair
    3. Sign the capacity entry with Ed25519 using `signDhtEntry` from `@warpgogol/passport/dht-sign`
    4. Start embedded DHT node
    5. `dhtPut(node, "capacity/<workshopId>", signedCapacity)` — store capacity under DHT key `capacity/<workshopId>`
    6. Stop DHT node
    7. Return published capacity with `replicatedTo: number`
- Register `dht.capacity.publish` in `dht-module.ts` (`cacheable: false`, `reads: ["werkstatt.capacity.json", "werkstatt.identity.json", "werkstatt.dht.json"]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm --filter @warpgogol/site-kernel test` — unit test: capacity publish signs and stores entry

**Completion criterion:** `dht.capacity.publish` reads local capacity, signs it, publishes to DHT under `capacity/<workshopId>` key.

**Human review:** no

---

### Step 9. `dht.placement` command handler

**Goal:** Implement the `dht.placement` command that decides which workshop should host a new site.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/placement.ts`:
  - `runDhtPlacement` handler:
    1. Read SWIM membership view from `werkstatt.genome.log` (via `packages/os/site-kernel/src/swim/genome-log.ts`)
    2. Filter alive workshops only (skip `dead` and `left` members)
    3. If no alive workshops or SWIM unavailable, return `reason: "local-fallback"` with current workshop as `assignedWorkshop`
    4. Start embedded DHT node
    5. For each alive workshop, `dhtGet(node, "capacity/<workshopId>")` — read capacity from DHT
    6. If no capacity entries found, return `reason: "local-fallback"`
    7. Select workshop with lowest load (`reason: "least-loaded"`)
    8. Stop DHT node
    9. Return `DHTPlacementResult` with `siteId`, `assignedWorkshop`, `reason`, `capacity`
- Register `dht.placement` in `dht-module.ts` (`cacheable: false`, `reads: ["werkstatt.dht.json", "werkstatt.genome.log", "werkstatt.identity.json"]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm --filter @warpgogol/site-kernel test` — unit test: placement returns `local-fallback` when SWIM unavailable, selects least-loaded workshop when SWIM available

**Completion criterion:** `dht.placement` returns `local-fallback` when SWIM or capacity is unavailable, selects least-loaded alive workshop otherwise.

**Human review:** no

---

### Step 10. `dht.status` command handler

**Goal:** Implement the `dht.status` command that reports local DHT node status.

**Agent actions:**

- Add `runDhtStatus` handler to `packages/os/site-kernel/src/dht/lookup.ts` (or a new `status.ts`):
  - Read `werkstatt.dht.json` config
  - Read `werkstatt.dht.cache.json` cache stats (entry count, oldest entry, expired entries)
  - Report: `configured: boolean`, `bindAddr`, `bootstrapNodes`, `cacheEntries`, `cacheHitRate` (if available)
  - No network I/O — local-only query (same pattern as `swim.status` and `gitmesh.status`)
- Register `dht.status` in `dht-module.ts` (`cacheable: false`, `reads: ["werkstatt.dht.json", "werkstatt.dht.cache.json"]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm exec site-kernel run dht.status --json` — returns config and cache stats

**Completion criterion:** `dht.status` reports DHT config and cache stats without network I/O.

**Human review:** no

---

### Step 11. Cache invalidation integration

**Goal:** Wire cache invalidation to SWIM dead-workshop detection (TTL-only, no push invalidation).

**Agent actions:**

- In `packages/os/site-kernel/src/dht/cache.ts`:
  - `invalidateDeadWorkshops(workspaceRoot, deadEndpoints)` — remove cache entries pointing to dead workshop endpoints
  - Call this function from `dht.lookup` before returning: read SWIM membership view, get dead members, invalidate cached entries pointing to dead workshops
  - TTL-based expiry is the sole consistency mechanism for re-registration updates — no push invalidation (embedded CLI lifecycle has no long-running process to receive push messages)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel test` — unit test: dead workshop entries are invalidated, re-registration invalidates cache

**Completion criterion:** Cache entries pointing to dead workshops are invalidated on next `dht.lookup`; TTL expiry ensures eventual consistency for re-registration updates.

**Human review:** no

---

### Step 12. Unit tests

**Goal:** Write unit tests for all DHT handlers.

**Agent actions:**

- Create `packages/os/site-kernel/src/dht/dht.test.ts`:
  - Test `dht.node.init` creates valid config
  - Test `dht.lookup` returns `found: false` for unknown site
  - Test `dht.lookup` returns cached entry on cache hit
  - Test `dht.lookup` validates signature and marks invalid entries
  - Test `dht.register` signs entry with Ed25519
  - Test `dht.register` LWW conflict resolution (newer timestamp wins, owner-signature priority for equal timestamps)
  - Test `dht.capacity.publish` signs and stores capacity entry
  - Test `dht.placement` returns `local-fallback` when SWIM unavailable
  - Test `dht.placement` returns `local-fallback` when capacity unavailable in DHT
  - Test `dht.placement` selects least-loaded alive workshop when capacity available
  - Test `dht.status` reports config and cache stats
  - Test cache TTL expiry
  - Test dead-workshop cache invalidation
  - Test `dht-sign.ts` sign/verify roundtrip
- Use `fast-check` for property-based tests where applicable (e.g., LWW conflict resolution with arbitrary timestamps)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel test`

**Completion criterion:** All DHT tests pass, covering all acceptance criteria.

**Human review:** no

---

### Step 13. Documentation sync

**Goal:** Update AGENTS.md and Compass XML files.

**Agent actions:**

- Update `packages/os/site-kernel/AGENTS.md`:
  - Add DHT section (after SWIM section):
    - `src/dht/` — DHT site registry and content placement (RFC-0562 Layer 3)
    - `types.ts` — TypeScript contracts
    - `config.ts` — loads `werkstatt.dht.json`
    - `node.ts` — embedded DHT node lifecycle (wraps `@libp2p/kad-dht` with S/Kademlia hardening)
    - `lookup.ts` — `dht.lookup` handler
    - `register.ts` — `dht.register` handler
    - `placement.ts` — `dht.placement` handler
    - `cache.ts` — local DHT lookup cache with TTL, re-registration push, dead-workshop invalidation
    - `capacity.ts` — `dht.capacity.publish` handler
    - `init.ts` — `dht.node.init` handler
    - `dht-module.ts` — registers 6 workspace commands, all `cacheable: false`
    - Config file: `werkstatt.dht.json` (workspace root, gitignored, created by `dht.node.init`)
    - Cache file: `werkstatt.dht.cache.json` (workspace root, gitignored)
    - Capacity file: `werkstatt.capacity.json` (workspace root, gitignored, updated by local process or CLI)
    - Identity integration: reads `werkstatt.identity.json` for operator public key and `PASSPORT_SIGNING_KEY` env var for Ed25519 signing via `@warpgogol/passport/dht-sign` (RFC-0558). Fails with `identity-not-bootstrapped` if identity is not set up.
    - SWIM integration: reads `werkstatt.genome.log` for membership view, skips dead workshops in routing and placement. Capacity read from DHT keys `capacity/<workshopId>` (published by `dht.capacity.publish`).
    - Ephemeral lifecycle: DHT node is created and destroyed within each command invocation — no long-running daemon. Cache consistency via TTL + dead-workshop invalidation (no push invalidation).
- Update `docs/technology.xml` — add DHT layer (Layer 3) to technology inventory
- Update `docs/development-plan.xml` — add DHT-related development milestones
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to update command manifest

**Validation:**

- `git diff --name-only` shows all 3 docs updated
- `pnpm exec site-kernel run ecosystem.manifest.validate`

**Completion criterion:** All 3 docs in `scope.docs` are updated; command manifest is regenerated.

**Human review:** no

---

### Final Step. Review, fix, acceptance criteria verification, and stamp

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0565`
- Run `pnpm --filter @warpgogol/site-kernel build:check`
- Run `pnpm --filter @warpgogol/ontology build:check`
- Run `pnpm --filter @warpgogol/site-kernel test`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if `fo-review` reported findings. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0565 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0565`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0565`
- `pnpm --filter @warpgogol/site-kernel build:check`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/passport build:check`
- `pnpm --filter @warpgogol/site-kernel test`
- `pnpm --filter @warpgogol/passport test`
- `pnpm exec site-kernel run ecosystem.manifest.validate`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0565` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0565.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0565` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Lookup latency O(log N) | Step 6: local cache with TTL reduces lookup frequency |
| Stale entries | Step 6: entries have `lastUpdated` timestamp; Step 11: TTL-based cache expiry and dead-workshop invalidation ensure eventual consistency |
| Sybil attacks | Step 5: S/Kademlia node id generation from public key (proof-of-work); pilot uses permissioned membership |
| Eclipse attacks | Step 5: S/Kademlia disjoint lookup paths in `node.ts` |
| DHT entry integrity | Step 4: Ed25519 signing via `@warpgogol/passport/dht-sign`; Step 6: signature validation in `dht.lookup` |
| Agent misinterpretation | Step 11: AGENTS.md rules for DHT module conventions |
| Bootstrap node unavailable | Step 5: `startDhtNode` fails with `bootstrap-unreachable` error (exit 1) |
| Concurrent registration conflict | Step 7: LWW conflict resolution with owner-signature priority |
| SWIM capacity metrics unavailable | Step 9: `dht.placement` falls back to `reason: "local-fallback"` when SWIM or capacity DHT entries unavailable |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 (Sternsystem bundle) or DNA-45 (Fleet registry), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0565 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `@libp2p/kad-dht` cannot support S/Kademlia hardening (disjoint paths, Sybil-resistant node ids) via wrapper approach, escalate to the operator — a custom implementation or alternative library may be needed.
- If Ed25519 signing from `@warpgogol/passport/dht-sign` cannot be reused for DHT entry signing (different subject shape), extend the module rather than duplicating crypto code.
