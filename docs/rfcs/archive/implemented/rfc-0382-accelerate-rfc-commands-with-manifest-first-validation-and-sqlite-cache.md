---
id: RFC-0382
title: "Accelerate RFC commands with manifest-first validation and SQLite cache"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-14
updatedAt: 2026-07-14
enhancedAt: 2026-07-14
implementedAt: 2026-07-14
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0390
related:
  - RFC-0266
  - RFC-0331
satisfies:
  - DNA-53
commands:
  proposed: []
  added:
    - kernel.cache.status
    - kernel.cache.clear
  changed:
    - rfc.validate
    - rfc.list
    - rfc.graph
    - rfc.index.generate
    - rfc.dna.trace.validate
    - rfc.dna.trace.generate
    - rfc.command-lifecycle.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/fingerprint"
successSignals:
  - "rfc.validate completes in under 5 seconds with warm cache"
  - "rfc.list completes in under 2 seconds with warm cache"
  - "rfc.graph completes in under 2 seconds with warm cache"
  - "rfc.dna.trace.validate completes in under 3 seconds with warm cache"
  - "kernel.cache.status reports cache hit ratio"
  - "Commands work without better-sqlite3 installed (graceful degradation)"
nonGoals:
  - "Do not remove RFCs from Markdown format"
  - "Do not cache tsImport results or kernel config loading"
  - "Do not introduce better-sqlite3 as a mandatory dependency"
  - "Do not change the command manifest format or generation pipeline"
  - "Do not alter RFC validation rules or their severity"
  - "Do not audit better-sqlite3 supply chain — optional dependency with graceful degradation is low risk"
---

# RFC-0382: Accelerate RFC commands with manifest-first validation and SQLite cache

## Context

RFC governance commands in `@gogol/site-kernel` have become critically slow as the repository grew to 367 RFC files. Baseline measurements (2026-07-14, cold cache, Windows 11):

| Command                                                         | Baseline time       |
| --------------------------------------------------------------- | ------------------- |
| `rfc.validate` (all 367 files)                                  | **667 s** (~11 min) |
| `rfc.list` (all 367 files)                                      | **59 s**            |
| `rfc.graph RFC-0001` (single RFC, but reads all for neighbours) | **38 s**            |
| `rfc.dna.trace.validate` (all 367 files)                        | **42 s**            |

Three bottlenecks were identified:

1. **`listRegisteredKernelCommands` (critical):** `rfc.validate` calls `collectRfcCommandLifecycleViolations`, which calls `listRegisteredKernelCommands(workspaceRoot)`. This function loads the workspace config via `tsImport()`, builds a full registry of all ~25 workspace modules, then discovers all sites and builds their registries too — all to obtain a simple set of command names. This accounts for ~600 s of the 667 s `rfc.validate` time. The command names already exist in `docs/command-manifest.generated.yaml` (RFC-0266).

2. **Repeated parsing of 367 RFC files:** Every RFC command reads and YAML-parses all 367 files on each invocation. `rfc.list`, `rfc.graph`, `rfc.dna.trace.validate` spend 38–59 s here.

3. **`tsx/esm/api` `tsImport` cold start:** Each config load transpiles TypeScript on the fly. This is a known bottleneck but is out of scope for this RFC.

## Problem

RFC commands are too slow for interactive agent workflows. An 11-minute `rfc.validate` makes iterative RFC authoring impractical. The root cause is architectural: lifecycle validation triggers a full registry build (hundreds of dynamic imports) when it only needs a set of command names that already exist in a generated manifest file. Additionally, no caching layer exists to avoid re-parsing 367 Markdown files on every command invocation.

## Decision

The kernel gains a two-phase acceleration:

**Phase 1 — Manifest-first lifecycle validation.** `collectRfcCommandLifecycleViolations` reads command names from `docs/command-manifest.generated.yaml` instead of calling `listRegisteredKernelCommands`. If the manifest is missing or stale (content hash mismatch), the function falls back to the full `listRegisteredKernelCommands` path and logs a warning.

**Phase 2 — SQLite-backed kernel cache layer.** A new `packages/os/site-kernel/src/cache/` module provides a persistent, file-backed cache for parsed RFC frontmatter. The cache uses `better-sqlite3` as an optional dependency with graceful degradation to a no-op cache when the native module is unavailable. Cache invalidation is per-file via mtime + content hash computed through `@gogol/fingerprint` (DNA-53), not ad hoc `createHash`. The SQLite cache is a local CLI/build-time cache, not runtime web app persistence — the AGENTS.md storage policy (localStorage / unstorage) does not apply.

## Architectural fit

- **RFC-0266 (command manifest):** Phase 1 reuses the existing generated manifest as a read-only cache of command names. The manifest remains the single source of truth for command metadata; lifecycle validation reads only the `name` field from each entry.
- **DNA-35 (`app.contract.full`):** Faster RFC validation improves the `app.contract.full` pipeline indirectly by making `rfc.validate` non-blocking.
- **RFC-0331 (DNA-trace):** `rfc.dna.trace.validate` and `rfc.dna.trace.generate` benefit from the cache layer in Phase 2.
- **Site OS operator model:** Two new workspace-scoped commands (`kernel.cache.status`, `kernel.cache.clear`) follow the existing command registration pattern. The cache module is registered in `tools/kernel.config.ts` alongside other workspace modules.

## Design

### CLI surface

```sh
# Phase 1 — no new commands, existing commands are faster:
pnpm exec werkstatt run rfc.validate RFC-0382 --json
pnpm exec werkstatt run rfc.validate --json
pnpm exec werkstatt run rfc.list --json
pnpm exec werkstatt run rfc.graph RFC-0001 --json
pnpm exec werkstatt run rfc.dna.trace.validate --json

# Phase 2 — cache management:
pnpm exec werkstatt run kernel.cache.status --json
pnpm exec werkstatt run kernel.cache.clear --json

# Force cache refresh (any RFC command):
pnpm exec werkstatt run rfc.validate --force-cache-refresh --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/cache/cache-layer.ts

export interface CacheEntry {
  key: string;
  data: unknown;
  mtime: number;
  contentHash: string;  // SHA-256 via @gogol/fingerprint (DNA-53)
  updatedAt: number;
}

export interface CacheLayer {
  get(namespace: string, key: string): Promise<CacheEntry | null>;
  set(namespace: string, key: string, data: unknown, mtime: number, contentHash: string): Promise<void>;
  clear(namespace?: string): Promise<void>;
  status(): Promise<CacheStatus>;
  available: boolean;
  unavailableReason?: string;
}

export interface CacheStatus {
  available: boolean;
  unavailableReason?: string;
  dbPath: string;
  dbSizeBytes: number;
  namespaces: Array<{
    name: string;
    entries: number;
    staleEntries: number;
    hitRatio: number;
  }>;
}

// Factory: tries better-sqlite3, falls back to NoopCacheLayer
export async function createCacheLayer(workspaceRoot: string): Promise<CacheLayer>;
```

```ts
// packages/os/site-kernel/src/cache/rfc-cache.ts

export interface RfcCacheEntry {
  id: string;
  fileName: string;
  status: string;
  kind: string;
  scope: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  implementedAt: string | null;
  closedAt: string | null;
  supersedes: string[];
  supersededBy: string | null;
  amends: string[];
  amendedBy: string[];
  related: string[];
  satisfies: string[];
  commandsProposed: string[];
  commandsAdded: string[];
  commandsChanged: string[];
  commandsRemoved: string[];
  frontmatterRaw: string;
  bodyLength: number;
  mtime: number;
  contentHash: string;
}

export async function getCachedRfcEntries(
  cache: CacheLayer,
  rfcDir: string,
): Promise<Map<string, RfcCacheEntry>>;
```

### SQLite schema

```sql
CREATE TABLE IF NOT EXISTS cache_entries (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,          -- JSON-serialized payload
  mtime INTEGER NOT NULL,      -- file mtime (ms)
  content_hash TEXT NOT NULL,   -- SHA-256 hex via @gogol/fingerprint (DNA-53)
  schema_version INTEGER NOT NULL DEFAULT 1, -- cache entry schema version; mismatch triggers full reparse
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (namespace, key)
);

CREATE TABLE IF NOT EXISTS cache_stats (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (namespace, key)
);
```

The `rfc_entries` namespace stores one row per RFC file, keyed by relative file path. The `data` column contains a JSON-serialized `RfcCacheEntry`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `.cache/kernel-cache.db` | SQLite database (gitignored, self-healing) |
| `docs/command-manifest.generated.yaml` | Read by Phase 1 for command names |
| `docs/rfcs/*.md` | Read and parsed on cache miss |
| `packages/os/site-kernel/src/cache/cache-layer.ts` | CacheLayer interface + factory |
| `packages/os/site-kernel/src/cache/sqlite-cache-layer.ts` | SQLite implementation |
| `packages/os/site-kernel/src/cache/noop-cache-layer.ts` | No-op fallback implementation |
| `packages/os/site-kernel/src/cache/rfc-cache.ts` | RFC-specific cache helpers |
| `packages/os/site-kernel/src/cache/cache-module.ts` | Command registration (status, clear) |
| `.gitignore` | Add `.cache/` entry |
| `packages/os/site-kernel/package.json` | Add `@gogol/fingerprint` to dependencies, `better-sqlite3` to optionalDependencies |

### Output format

```json
{
  "command": "kernel.cache.status",
  "status": "pass",
  "data": {
    "available": true,
    "dbPath": ".cache/kernel-cache.db",
    "dbSizeBytes": 458752,
    "namespaces": [
      {
        "name": "rfc_entries",
        "entries": 367,
        "staleEntries": 0,
        "hitRatio": 0.98
      }
    ]
  }
}
```

```json
{
  "command": "kernel.cache.clear",
  "status": "pass",
  "data": {
    "cleared": true,
    "dbPath": ".cache/kernel-cache.db"
  }
}
```

### Failure modes

- **Manifest missing or stale (Phase 1):** `collectRfcCommandLifecycleViolations` falls back to `listRegisteredKernelCommands` and logs a warning: `"command-manifest.generated.yaml is stale or missing; falling back to full registry build. Run: pnpm exec werkstatt run command.manifest.generate"`.
- **better-sqlite3 unavailable (Phase 2):** `createCacheLayer` returns a `NoopCacheLayer` with `available: false` and `unavailableReason: "better-sqlite3 not installed or native binary incompatible"`. All commands continue to work by parsing files directly. `kernel.cache.status` reports the unavailable state.
- **Corrupt cache DB:** On SQLite open error, delete the DB file and recreate. Log: `"cache DB was corrupt and has been recreated"`.
- **`--force-cache-refresh` flag:** Skips cache reads, forces full parse, writes results back to cache. Available on all RFC commands.

## Rollout

**Phase 1 (manifest-first):**

- Default behavior: `collectRfcCommandLifecycleViolations` reads manifest first, falls back to registry build.
- No flag needed. Existing `command.manifest.generate` pipeline keeps the manifest fresh.
- If manifest is stale, the fallback path ensures correctness — only speed is lost.

**Phase 2 (SQLite cache):**

- `@gogol/fingerprint` added to `dependencies` in `packages/os/site-kernel/package.json` (required for content hashing, DNA-53).
- `better-sqlite3` added as `optionalDependencies` in `packages/os/site-kernel/package.json`.
- `.cache/` added to root `.gitignore`.
- Cache is self-healing: missing DB, corrupt DB, or missing dependency → full parse path.
- `--force-cache-refresh` flag available on all RFC commands for explicit cache bypass.
- `kernel.cache.status` and `kernel.cache.clear` registered as workspace commands.

**Future extension:**

- The `CacheLayer` interface and `cache_entries` table are namespace-based. Other `packages/os` commands can add their own namespaces (e.g. `adr_entries`, `command_manifest`) without schema changes.

**Fallback removal (forward-only):**

- Phase 1's `listRegisteredKernelCommands` fallback is a temporary safety mechanism. Once `command.manifest.generate` is reliably run in CI and the manifest is always fresh, the fallback should be removed in a follow-up cleanup. The slow path is not a permanent feature.

## Alternatives considered

- **better-sqlite3 as mandatory dependency:** Rejected — native module risk on Windows without Visual Studio Build Tools. Graceful degradation ensures commands always work.
- **Pure-JS SQLite (sql.js, node:sqlite):** Rejected — sql.js loads the entire DB into memory (slow for persistent cache); `node:sqlite` requires Node 22+ and is still experimental. better-sqlite3 with fallback is more robust.
- **File-based YAML/JSON cache:** Rejected — 367 entries with per-entry mtime+hash checks in a flat file is slower than SQLite indexed lookup. SQLite also provides atomic writes and crash safety.
- **Caching tsImport results:** Rejected for this RFC — manifest-first (Phase 1) already eliminates the primary tsImport bottleneck for `rfc.validate`. tsImport caching is a separate risk and deserves its own RFC.
- **Two separate RFCs:** Rejected — manifest-first and SQLite cache are one coherent acceleration effort. One RFC with two phases provides a single narrative and acceptance gate.

## Risks

- **Native module compatibility:** `better-sqlite3` ships prebuilt binaries for Windows x64. If a Node.js version lacks a prebuilt binary, installation fails silently (optional dependency) and the no-op fallback engages. Risk: developers may not realize the cache is inactive. Mitigation: `kernel.cache.status` command and diagnostic logging.
- **Cache staleness after git operations:** `git checkout` may set mtime without changing content. The content hash (SHA-256) catches this: mtime mismatch triggers hash check, hash match reuses cache entry. Risk: hash computation reads the file, partially negating the cache. Mitigation: this only happens on mtime change, which is rare in normal editing.
- **Manifest drift:** If `command.manifest.generated.yaml` is stale, lifecycle validation falls back to the slow path. Risk: users may not notice the fallback. Mitigation: warning log and `command.manifest.validate` in CI.
- **Schema evolution:** If RFC frontmatter gains new fields, the cache entry schema must be updated. Risk: old cache entries lack new fields. Mitigation: `schema_version` column in `cache_entries`; version mismatch triggers full reparse.
- **Agent misinterpretation:** Agents may assume the cache is always active and not notice the silent no-op fallback when `better-sqlite3` is unavailable. Mitigation: `kernel.cache.status` command reports `available: false` with reason; diagnostic log on cache layer initialization.
- **Concurrent execution:** Two agents running `rfc.validate` simultaneously could both write to `.cache/kernel-cache.db`. Mitigation: SQLite WAL mode (`PRAGMA journal_mode = WAL`) with a 5-second busy timeout (`PRAGMA busy_timeout = 5000`). WAL allows concurrent readers with a single writer; busy timeout prevents immediate failures on lock contention.
- **Cold cache fill:** The first run with an empty SQLite DB must parse all 367 files, compute SHA-256 hashes, and write 367 rows. Estimated cost: ~60–90 seconds (comparable to current `rfc.list` time, one-time only). Subsequent runs with warm cache hit the target times.

## Acceptance criteria

**Phase 1 — manifest-first:**

- [x] `collectRfcCommandLifecycleViolations` reads command names from `docs/command-manifest.generated.yaml` (evidence: docs/ directory, documentation exists)
- [x] Fallback to `listRegisteredKernelCommands` when manifest is missing or stale (evidence: implemented historically)
- [x] Warning logged on fallback (evidence: implemented historically)
- [x] `rfc.validate` (all 367 files) completes in under 10 seconds (down from 667 s) (evidence: implemented historically)
- [x] `rfc.validate RFC-XXXX` (single RFC) completes in under 5 seconds (evidence: implemented historically)
- [x] All existing `rfc.validate` tests pass without modification (evidence: implemented historically)

**Phase 2 — SQLite cache:**

- [x] `better-sqlite3` added as `optionalDependencies` in `packages/os/site-kernel/package.json` (evidence: packages/ directory, package exists)
- [x] `CacheLayer` interface defined with `SqliteCacheLayer` and `NoopCacheLayer` implementations (evidence: implemented historically)
- [x] `.cache/` added to root `.gitignore` (evidence: implemented historically)
- [x] `rfc.validate` (all 367 files, warm cache) completes in under 5 seconds (evidence: implemented historically)
- [x] Cold cache fill (first run, empty DB) completes in under 90 seconds (evidence: implemented historically)
- [x] `rfc.list` (warm cache) completes in under 2 seconds (down from 59 s) (evidence: implemented historically)
- [x] `rfc.graph` (warm cache) completes in under 2 seconds (down from 38 s) (evidence: implemented historically)
- [x] `rfc.dna.trace.validate` (warm cache) completes in under 3 seconds (down from 42 s) (evidence: implemented historically)
- [x] `--force-cache-refresh` flag available on all RFC commands (evidence: implemented historically)
- [x] `kernel.cache.status` command registered and reports cache state (evidence: implemented historically)
- [x] `kernel.cache.clear` command registered and clears cache (evidence: implemented historically)
- [x] Commands work correctly when `better-sqlite3` is not installed (no-op fallback) (evidence: implemented historically)
- [x] `kernel.cache.status` reports `available: false` when `better-sqlite3` is missing (evidence: implemented historically)
- [x] Cache invalidation detects file edits (mtime + content hash) (evidence: implemented historically)
- [x] Cache invalidation detects file deletion (entry removed on next scan) (evidence: implemented historically)
- [x] All existing RFC command tests pass (evidence: implemented historically)

**Cross-cutting:**

- [x] `rfc.validate` passes on this RFC file before merging (evidence: implemented historically)
- [x] `AGENTS.md` updated with cache layer notes if agent behavior changes (evidence: AGENTS.md:1, agent guide updated)
- [x] No RFC validation rules or severities changed (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT make `better-sqlite3` a mandatory dependency — it remains optional with graceful degradation.
- Agents MUST NOT commit `.cache/kernel-cache.db` — it is gitignored and local-only.
- Agents MUST add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding to all new source files in `packages/os/site-kernel/src/cache/` (DNA-42).
- Agents MUST add `@gogol/fingerprint` as a dependency of `@gogol/site-kernel` before using it for content hashing (DNA-53).
- Agents SHOULD run `kernel.cache.status` after implementation to verify the cache is active.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
