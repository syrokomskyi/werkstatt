---
reviewId: REVIEW-CODE-2026-07-14-01
date: 2026-07-14
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 5e9b2c048...HEAD
filesReviewed:
  - packages/os/site-kernel/src/cache/cache-layer.ts
  - packages/os/site-kernel/src/cache/noop-cache-layer.ts
  - packages/os/site-kernel/src/cache/sqlite-cache-layer.ts
  - packages/os/site-kernel/src/cache/rfc-cache.ts
  - packages/os/site-kernel/src/cache/cache-module.ts
  - packages/os/site-kernel/src/cache/cache-handlers.ts
  - packages/os/site-kernel/src/rfc/handlers/lifecycle.ts
  - packages/os/site-kernel/src/rfc/handlers/validate.ts
  - packages/os/site-kernel/src/rfc/handlers/list-create.ts
  - packages/os/site-kernel/src/rfc/handlers/index-graph.ts
  - packages/os/site-kernel/src/rfc/dna-trace.ts
  - packages/os/site-kernel/src/rfc/rfc.module.ts
  - packages/os/site-kernel/package.json
  - packages/os/site-kernel/AGENTS.md
  - tools/kernel.config.ts
  - docs/rfcs/rfc-0382-accelerate-rfc-commands-with-manifest-first-validation-and-sqlite-cache.md
  - docs/command-manifest.generated.yaml
---

# Code Review: 5e9b2c048...HEAD (RFC-0382 implementation)

### Verdict: Approved

The implementation is structurally sound, DNA-aligned, and ecosystem-fit. Two minor blind spots in `rfc-cache.ts` (unused schema version check, dynamic import) are non-blocking and can be addressed in a follow-up. The graceful fallback to `NoopCacheLayer` when `better-sqlite3` is unavailable works correctly — verified live on Windows where the native binary failed to compile.

### Mechanical floor

Pass — `pnpm --filter @gogol/site-kernel run build:check` passes. `rfc.validate RFC-0382 --json` passes. `command.manifest.validate` passes (0 errors, 5 pre-existing warnings). `kernel.cache.status --json` runs and reports `available: false` with clear reason.

### Axis A — Structural correctness

No issues. The cache layer is cleanly separated: `CacheLayer` interface → `SqliteCacheLayer` / `NoopCacheLayer` implementations → `rfc-cache.ts` domain helpers → `cache-module.ts` command registration. The factory pattern in `createCacheLayer` correctly uses dynamic imports for optional dependency isolation.

### Axis B — DNA alignment

No issues. DNA-53 (content hashing) satisfied via `byteHashFile` from `@gogol/fingerprint`. DNA-42 (Compass scaffolding) — all 6 new source files in `src/cache/` have `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Cache DB stored in `.cache/` which is already gitignored.

### Axis C — Ecosystem fit

No issues. Cache module registered in `tools/kernel.config.ts` with `MODULE_MAP` entry. `--force-cache-refresh` flag added to all 7 RFC commands that read frontmatter. `kernel.cache.status` and `kernel.cache.clear` commands registered with proper scope, flags, and `mutatesState` declarations. `@gogol/fingerprint` added to `dependencies` in `package.json`.

### Axis D — Forward-only compliance

No issues. The manifest-first lifecycle validation has a fallback to `listRegisteredKernelCommands` when the manifest is stale, but this is documented in the RFC as a temporary safety net with a removal note, not a permanent backward compat layer. No deprecated APIs or compatibility shims introduced.

### Axis E — Agent-facing clarity

No issues. `packages/os/site-kernel/AGENTS.md` updated with "Kernel cache (RFC-0382)" section documenting all cache files, their roles, the `--force-cache-refresh` flag, and the manifest-first lifecycle validation. `kernel.cache.status` reports clear `unavailableReason` when SQLite is missing.

### Axis F — Pragmatism

No issues. The `better-sqlite3` optional dependency approach is pragmatic — commands work without it, and the cache automatically engages when the native binary is available. The `createRequire` fix for ESM compatibility was necessary and correctly applied.

### Axis G — Blind spots

1. **Minor:** `RFC_CACHE_SCHEMA_VERSION` is defined at `rfc-cache.ts:27` but never checked during cache invalidation. The `schema_version` column exists in the SQLite schema but `getCachedEntryForFile` only compares `mtime` and `contentHash`. If the `RfcCacheEntry` interface gains new fields, old cache entries with a different schema version would be served as valid. Mitigation: schema changes typically coincide with code changes that alter content hashes, but an explicit `schema_version` check would be more robust.

2. **Minor:** `rfc-cache.ts:154` uses a dynamic `import("node:fs/promises")` to get `readFile`, but `stat` is already imported at the top of the file (line 18). `readFile` should be added to the top-level import for consistency and to avoid repeated dynamic import overhead.

3. **Minor:** `SqliteCacheLayer.status()` always returns `staleEntries: 0` — the field is a placeholder. The comment notes that real staleness is determined by callers comparing mtime + contentHash, but the field could be removed or implemented.

### Spec compliance

| Requirement from RFC-0382 | Status | Evidence |
| --- | --- | --- |
| Phase 1: manifest-first lifecycle validation | Done | `lifecycle.ts:33-51` reads from manifest, falls back with warning |
| Phase 2: CacheLayer interface + SqliteCacheLayer + NoopCacheLayer | Done | `cache-layer.ts`, `sqlite-cache-layer.ts`, `noop-cache-layer.ts` |
| RFC cache helpers with @gogol/fingerprint | Done | `rfc-cache.ts` uses `byteHashFile` |
| kernel.cache.status and kernel.cache.clear commands | Done | `cache-module.ts`, `cache-handlers.ts` |
| --force-cache-refresh flag on all RFC commands | Done | `rfc.module.ts` — 7 commands updated |
| Cache in .cache/kernel-cache.db (gitignored) | Done | `.cache/` already in `.gitignore` |
| AGENTS.md updated | Done | `packages/os/site-kernel/AGENTS.md` — new section |
| Compass scaffolding on new files | Done | All 6 new files have MODULE_CONTRACT + CHANGE_SUMMARY |
| Graceful fallback when better-sqlite3 missing | Done | Verified live on Windows — NoopCacheLayer engages |

### Questions for the author

1. Should `RFC_CACHE_SCHEMA_VERSION` be checked during cache invalidation to force reparse when the entry schema evolves?
2. The `staleEntries` field in `CacheNamespaceStatus` is always 0 — should it be removed or implemented?
