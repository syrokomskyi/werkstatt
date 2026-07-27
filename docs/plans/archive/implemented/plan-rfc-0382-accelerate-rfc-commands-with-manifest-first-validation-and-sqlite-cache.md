---
rfcId: RFC-0382
planId: PLAN-RFC-0382-01
status: draft
owner: architecture
createdAt: 2026-07-14
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel"
    - "@gogol/fingerprint"
  services: []
  docs:
    - docs/rfcs/rfc-0382-accelerate-rfc-commands-with-manifest-first-validation-and-sqlite-cache.md
    - .gitignore
    - packages/os/site-kernel/package.json
    - tools/kernel.config.ts
---

# Implementation Plan: RFC-0382

## 1. Objectives

- [ ] O1 — Manifest-first lifecycle validation eliminates `listRegisteredKernelCommands` call from `rfc.validate` hot path (maps to acceptance: "collectRfcCommandLifecycleViolations reads command names from manifest", "rfc.validate < 10s")
- [ ] O2 — SQLite-backed `CacheLayer` with `NoopCacheLayer` fallback (maps to acceptance: "CacheLayer interface defined", "Commands work without better-sqlite3")
- [ ] O3 — RFC commands use cache for frontmatter parsing (maps to acceptance: "rfc.validate < 5s warm", "rfc.list < 2s", "rfc.graph < 2s", "rfc.dna.trace.validate < 3s")
- [ ] O4 — `kernel.cache.status` and `kernel.cache.clear` commands registered (maps to acceptance: "kernel.cache.status registered", "kernel.cache.clear registered")
- [ ] O5 — `--force-cache-refresh` flag on all RFC commands (maps to acceptance: "--force-cache-refresh flag available")
- [ ] O6 — Cache invalidation via mtime + content hash using `@gogol/fingerprint` (maps to acceptance: "Cache invalidation detects file edits", "Cache invalidation detects file deletion")
- [ ] O7 — `.cache/` gitignored and `better-sqlite3` optional dependency (maps to acceptance: ".cache/ added to .gitignore", "better-sqlite3 optionalDependencies")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/cache/cache-layer.ts` — `CacheLayer` interface, `CacheEntry`, `CacheStatus`, `createCacheLayer` factory
- `packages/os/site-kernel/src/cache/sqlite-cache-layer.ts` — `SqliteCacheLayer` implementation (WAL mode, busy timeout)
- `packages/os/site-kernel/src/cache/noop-cache-layer.ts` — `NoopCacheLayer` fallback
- `packages/os/site-kernel/src/cache/rfc-cache.ts` — `RfcCacheEntry`, `getCachedRfcEntries` helper
- `packages/os/site-kernel/src/cache/cache-module.ts` — `cacheModule` registering `kernel.cache.status` and `kernel.cache.clear`
- `packages/os/site-kernel/src/rfc/handlers/lifecycle.ts` — Phase 1: manifest-first `getLiveCommands`
- `packages/os/site-kernel/src/rfc/handlers/validate.ts` — Phase 2: use `getCachedRfcEntries`
- `packages/os/site-kernel/src/rfc/handlers/list-create.ts` — Phase 2: use `getCachedRfcEntries` for `runRfcList`
- `packages/os/site-kernel/src/rfc/handlers/index-graph.ts` — Phase 2: use `getCachedRfcEntries` for `runRfcIndexGenerate` and `runRfcGraph`
- `packages/os/site-kernel/src/rfc/dna-trace.ts` — Phase 2: use `getCachedRfcEntries` for `collectSatisfies`
- `packages/os/site-kernel/src/rfc/frontmatter-io.ts` — Add `readAndParseRfcWithStat` (returns mtime + content for cache fill)
- `packages/os/site-kernel/src/rfc/rfc.module.ts` — Add `--force-cache-refresh` flag to all RFC commands
- `packages/os/site-kernel/src/index.ts` — Export `cacheModule` if needed
- `tools/kernel.config.ts` — Register `cache` module loader

### 2.2 Configuration and data

- `packages/os/site-kernel/package.json` — Add `@gogol/fingerprint` to `dependencies`, `better-sqlite3` to `optionalDependencies`
- `.gitignore` — Add `.cache/` entry
- `.cache/kernel-cache.db` — SQLite database (gitignored, self-healing, not committed)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0382-accelerate-rfc-commands-with-manifest-first-validation-and-sqlite-cache.md` — Read-only reference
- `AGENTS.md` (root) — Add cache layer note in the Site OS operator model section if agent behavior changes
- No `docs/*.xml` Compass sync needed — no repository-wide requirements or shared package contracts changed
- No `docs/architecture-dna.md` changes — no new DNA invariant

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate RFC-0382 --json` — must pass
- `pnpm --filter @gogol/site-kernel run build:check` — TypeScript must compile
- `pnpm --filter @gogol/site-kernel run test` — existing tests must pass
- `pnpm exec site-kernel run command.manifest.generate` — regenerate manifest with new `kernel.cache.*` commands
- `pnpm exec site-kernel run kernel.cache.status --json` — verify cache is active
- `pnpm exec site-kernel run kernel.cache.clear --json` — verify cache clears
- No new pipeline membership — `kernel.cache.*` commands are standalone workspace commands

## 3. Step sequence

### Step 1. Add dependencies and .gitignore

**Goal:** Establish the dependency and filesystem foundation for the cache layer.

**Agent actions:**

- Add `@gogol/fingerprint` to `dependencies` in `packages/os/site-kernel/package.json`
- Add `better-sqlite3` to `optionalDependencies` in `packages/os/site-kernel/package.json` with a compatible version range
- Add `@types/better-sqlite3` to `devDependencies` in `packages/os/site-kernel/package.json`
- Add `.cache/` to root `.gitignore`
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `.gitignore` contains `.cache/`

**Completion criterion:** `package.json` has `@gogol/fingerprint` in dependencies, `better-sqlite3` in optionalDependencies, `.gitignore` has `.cache/`, `pnpm install` succeeds.

**Human review:** no

---

### Step 2. Implement CacheLayer interface and NoopCacheLayer

**Goal:** Define the cache contract and the fallback implementation.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/cache-layer.ts` with:
  - `CacheEntry` interface (key, data, mtime, contentHash, updatedAt)
  - `CacheLayer` interface (get, set, clear, status, available, unavailableReason)
  - `CacheStatus` interface
  - `createCacheLayer(workspaceRoot)` factory function (tries better-sqlite3, falls back to NoopCacheLayer)
- Create `packages/os/site-kernel/src/cache/noop-cache-layer.ts` with:
  - `NoopCacheLayer` class implementing `CacheLayer`
  - `available: false`, `unavailableReason: "better-sqlite3 not installed or native binary incompatible"`
  - `get()` always returns `null`, `set()` is a no-op, `clear()` is a no-op
  - `status()` returns `available: false` with `dbPath: ".cache/kernel-cache.db"`, `dbSizeBytes: 0`, `namespaces: []`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding to both files (DNA-42)

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** `cache-layer.ts` and `noop-cache-layer.ts` exist with Compass scaffolding, TypeScript compiles, `NoopCacheLayer` implements `CacheLayer`.

**Human review:** no

---

### Step 3. Implement SqliteCacheLayer

**Goal:** SQLite-backed cache with WAL mode, busy timeout, and self-healing.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/sqlite-cache-layer.ts` with:
  - `SqliteCacheLayer` class implementing `CacheLayer`
  - Opens `.cache/kernel-cache.db` with `better-sqlite3` (dynamic `require()`)
  - Sets `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000`
  - Creates `cache_entries` and `cache_stats` tables if not exist (DDL from RFC schema)
  - `get(namespace, key)` — reads row, returns `CacheEntry` or `null`, increments `cache_stats` hits/misses
  - `set(namespace, key, data, mtime, contentHash)` — upserts row with `schema_version = 1`
  - `clear(namespace?)` — deletes rows (all or by namespace)
  - `status()` — returns `CacheStatus` with db size, namespace stats, hit ratio
  - `available: true`
  - On open error: delete corrupt DB file, recreate, log warning
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** `sqlite-cache-layer.ts` exists with Compass scaffolding, TypeScript compiles, `SqliteCacheLayer` implements `CacheLayer` with WAL mode and busy timeout.

**Human review:** no

---

### Step 4. Implement RFC cache helpers

**Goal:** RFC-specific cache read/fill logic using `@gogol/fingerprint` for content hashing.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/rfc-cache.ts` with:
  - `RfcCacheEntry` interface (all denormalized frontmatter fields from RFC schema, plus `body: string` — the RFC body is cached to fully eliminate file reads for `rfc.validate` which needs body for section validation and RFC-CMD-04 command presence checks)
  - `RFC_CACHE_NAMESPACE = "rfc_entries"` constant
  - `RFC_CACHE_SCHEMA_VERSION = 1` constant
  - `getCachedRfcEntries(cache, rfcDir)` function:
    1. List all RFC files via `listRfcFiles`
    2. For each file: check cache by relative path key
    3. If cache hit (mtime matches + content hash matches + schema_version matches): deserialize `RfcCacheEntry` (includes body)
    4. If cache miss: read file, parse frontmatter + body, compute `byteHashFile` via `@gogol/fingerprint`, build `RfcCacheEntry` with `frontmatterRaw` (JSON) and `body` (string), write to cache
    5. Detect deleted files: cache entries not in current file list are invalidated
    6. Return `Map<string, RfcCacheEntry>` keyed by RFC id
  - `getCachedRfcEntry(cache, rfcDir, fileName)` for single-file lookups (rfc.graph)
  - `rfcCacheEntryToParsedRfc(entry)` — converts `RfcCacheEntry` to `ParsedRfc` shape (`{ frontmatter: JSON.parse(frontmatterRaw), body }`)
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)
- Use `byteHashFile` from `@gogol/fingerprint` for content hashing (DNA-53)

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** `rfc-cache.ts` exists with Compass scaffolding, uses `@gogol/fingerprint.byteHashFile`, TypeScript compiles.

**Human review:** no

---

### Step 5. Implement cache module and register commands

**Goal:** Register `kernel.cache.status` and `kernel.cache.clear` as workspace commands.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/cache-module.ts` with:
  - `cacheModule` `KernelModule` exporting `name: "cache"`
  - `runKernelCacheStatus` handler — calls `createCacheLayer`, returns `CacheStatus` as JSON
  - `runKernelCacheClear` handler — calls `createCacheLayer`, clears all namespaces, returns `{ cleared: true, dbPath }`
  - Both commands: `scope: "workspace"`, `flags: {}`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)
- Add `"cache"` module loader to `tools/kernel.config.ts`:
  ```ts
  cache: async () => (await import("@gogol/site-kernel/cache-module")).cacheModule,
  ```
- Add export to `packages/os/site-kernel/package.json` exports map: `"./cache-module"`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run kernel.cache.status --json` returns valid JSON

**Completion criterion:** `cache-module.ts` exists, `tools/kernel.config.ts` registers `cache` module, `kernel.cache.status` and `kernel.cache.clear` are registered commands.

**Human review:** no

---

### Step 6. Phase 1 — Manifest-first lifecycle validation

**Goal:** Replace `listRegisteredKernelCommands` with manifest read in lifecycle validation.

**Agent actions:**

- Edit `packages/os/site-kernel/src/rfc/handlers/lifecycle.ts`:
  - Add `readCommandNamesFromManifest(workspaceRoot)` function:
    1. Read `docs/command-manifest.generated.yaml`
    2. Parse YAML, extract `commands[].name` into a `Set<string>`
    3. If file missing or unparseable: return `null` (triggers fallback)
  - Replace `getLiveCommands()` to call `readCommandNamesFromManifest` first
  - If manifest returns `null`: fall back to `listRegisteredKernelCommands`, log warning: `"command-manifest.generated.yaml is stale or missing; falling back to full registry build. Run: pnpm exec site-kernel run command.manifest.generate"`
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in the file

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run rfc.validate RFC-0382 --json` passes and completes in under 10 seconds
- `pnpm exec site-kernel run rfc.validate --json` (all 367 files) completes in under 10 seconds

**Completion criterion:** `lifecycle.ts` reads manifest first, falls back to `listRegisteredKernelCommands` with warning, `rfc.validate` completes in under 10 seconds.

**Human review:** no

---

### Step 7. Phase 2 — Integrate cache into rfc.validate

**Goal:** Use `getCachedRfcEntries` in `rfc.validate` instead of repeated `readAndParseRfc`.

**Agent actions:**

- Edit `packages/os/site-kernel/src/rfc/handlers/validate.ts`:
  - Import `createCacheLayer`, `getCachedRfcEntries`, and `rfcCacheEntryToParsedRfc`
  - Replace the `for (const f of allFiles)` loop that calls `readAndParseRfc` with:
    ```ts
    const cache = await createCacheLayer(workspaceRoot);
    const cachedEntries = await getCachedRfcEntries(cache, rfcDirPath);
    ```
  - Convert `RfcCacheEntry` to `ParsedRfc` via `rfcCacheEntryToParsedRfc` for `allParsed` and `allParsedByFile` maps (body is included in cache entry, no file reads needed on warm cache)
  - Respect `--force-cache-refresh` flag: if set, skip cache reads, force full parse, write back
  - Pass `allParsedByFile` to `collectRfcCommandLifecycleViolations` (already done)
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run rfc.validate RFC-0382 --json` passes
- `pnpm exec site-kernel run rfc.validate --json` (warm cache) completes in under 5 seconds

**Completion criterion:** `validate.ts` uses cache, `rfc.validate` warm cache completes in under 5 seconds.

**Human review:** no

---

### Step 8. Phase 2 — Integrate cache into rfc.list, rfc.graph, rfc.index.generate

**Goal:** Use cache in remaining RFC read-heavy commands.

**Agent actions:**

- Edit `packages/os/site-kernel/src/rfc/handlers/list-create.ts` (`runRfcList`):
  - Replace `readAndParseRfc` loop with `getCachedRfcEntries`
  - Build `RfcListEntry` from `RfcCacheEntry` fields
  - Respect `--force-cache-refresh`
- Edit `packages/os/site-kernel/src/rfc/handlers/index-graph.ts`:
  - `runRfcIndexGenerate`: use `getCachedRfcEntries` for all files
  - `runRfcGraph`: use `getCachedRfcEntry` for single file
  - Respect `--force-cache-refresh`
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in both files

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run rfc.list --json` (warm cache) completes in under 2 seconds
- `pnpm exec site-kernel run rfc.graph RFC-0001 --json` (warm cache) completes in under 2 seconds

**Completion criterion:** `list-create.ts` and `index-graph.ts` use cache, warm cache times meet targets.

**Human review:** no

---

### Step 9. Phase 2 — Integrate cache into rfc.dna.trace.validate and generate

**Goal:** Use cache in DNA-trace commands.

**Agent actions:**

- Edit `packages/os/site-kernel/src/rfc/dna-trace.ts`:
  - Replace `collectSatisfies` to use `getCachedRfcEntries` instead of `readAndParseRfc` loop
  - Extract `satisfies` and `status` from `RfcCacheEntry` instead of parsing frontmatter
  - Respect `--force-cache-refresh`
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run rfc.dna.trace.validate --json` (warm cache) completes in under 3 seconds

**Completion criterion:** `dna-trace.ts` uses cache, warm cache time meets target.

**Human review:** no

---

### Step 10. Add --force-cache-refresh flag to RFC commands

**Goal:** All RFC commands accept `--force-cache-refresh` to bypass cache reads.

**Agent actions:**

- Edit `packages/os/site-kernel/src/rfc/rfc.module.ts`:
  - Add `"force-cache-refresh"` flag spec (`kind: "boolean"`) to: `rfc.validate`, `rfc.list`, `rfc.graph`, `rfc.index.generate`, `rfc.dna.trace.validate`, `rfc.dna.trace.generate`, `rfc.command-lifecycle.validate`
- Ensure handlers read `input.flags["force-cache-refresh"]` and skip cache reads when set
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run rfc.validate --force-cache-refresh --json` works (full parse, writes back to cache)

**Completion criterion:** All RFC commands have `--force-cache-refresh` flag, flag bypasses cache reads.

**Human review:** no

---

### Step 11. Regenerate command manifest and validate

**Goal:** Update `docs/command-manifest.generated.yaml` with new `kernel.cache.*` commands and changed RFC commands.

**Agent actions:**

- Run `pnpm exec site-kernel run command.manifest.generate`
- Run `pnpm exec site-kernel run command.manifest.validate --json` — must pass
- Run `pnpm exec site-kernel run rfc.validate RFC-0382 --json` — must pass (lifecycle validation should now find `kernel.cache.status` and `kernel.cache.clear` in the manifest)

**Validation:**

- `command.manifest.validate` passes
- `rfc.validate RFC-0382` passes

**Completion criterion:** Manifest regenerated, includes `kernel.cache.status` and `kernel.cache.clear`, validation passes.

**Human review:** no

---

### Step 12. Run test suite and fix regressions

**Goal:** Ensure no existing tests are broken.

**Agent actions:**

- Run `pnpm --filter @gogol/site-kernel run test`
- Fix any test failures caused by the cache integration
- Add unit tests for `NoopCacheLayer` (always returns null, status reports unavailable)
- Add unit test for `createCacheLayer` fallback when `better-sqlite3` is not loadable

**Validation:**

- `pnpm --filter @gogol/site-kernel run test` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** All tests pass, new cache tests pass.

**Human review:** no

---

### Step 13. Performance verification

**Goal:** Confirm acceptance criteria timing targets are met.

**Agent actions:**

- Clear cache: `pnpm exec site-kernel run kernel.cache.clear --json`
- Measure cold cache fill: time `pnpm exec site-kernel run rfc.validate --json` (first run, must be under 90 seconds)
- Measure warm cache times (second run):
  - `pnpm exec site-kernel run rfc.validate --json` — must be under 5 seconds
  - `pnpm exec site-kernel run rfc.list --json` — must be under 2 seconds
  - `pnpm exec site-kernel run rfc.graph RFC-0001 --json` — must be under 2 seconds
  - `pnpm exec site-kernel run rfc.dna.trace.validate --json` — must be under 3 seconds
- Measure single-RFC validate: `pnpm exec site-kernel run rfc.validate RFC-0382 --json` — must be under 5 seconds
- Run `pnpm exec site-kernel run kernel.cache.status --json` — verify hit ratio and entry count
- Record timing results as evidence

**Validation:**

- All timing targets met

**Completion criterion:** All timing acceptance criteria met, evidence recorded.

**Human review:** no

---

### Step 14. Update AGENTS.md and Compass docs

**Goal:** Document the cache layer for agents.

**Agent actions:**

- Add a brief note in root `AGENTS.md` under the Site OS operator model section:
  - `kernel.cache.status` and `kernel.cache.clear` commands exist
  - `.cache/` is gitignored and self-healing
  - `better-sqlite3` is optional; commands work without it
- Check if `docs/*.xml` files need updates (likely not — no repository-wide requirements changed)
- Update `docs/COMMANDS.md` if it references the command manifest

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0382 --json` passes

**Completion criterion:** `AGENTS.md` has cache layer note, `rfc.validate` still passes.

**Human review:** no

---

### Step 15. Stamp implemented and commit evidence

**Goal:** Transition RFC to `implemented` status with verification evidence.

**Agent actions:**

- Set `status: implemented` and `implementedAt: 2026-07-14` in RFC-0382 frontmatter
- Run `pnpm exec site-kernel run rfc.validate RFC-0382 --json` — must pass
- Commit all changes with reference to RFC-0382 in commit messages
- Run `pnpm exec site-kernel run command.manifest.generate` to update manifest with `implemented` status

**Validation:**

- `rfc.validate RFC-0382` passes with `status: implemented`
- `command.manifest.validate` passes

**Completion criterion:** RFC-0382 is `implemented`, all validation passes.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0382 --json` — must pass
- `pnpm --filter @gogol/site-kernel run build:check` — TypeScript must compile
- `pnpm --filter @gogol/site-kernel run test` — all tests must pass
- `pnpm exec site-kernel run command.manifest.validate --json` — manifest must be current
- `pnpm exec site-kernel run kernel.cache.status --json` — cache must be active (or report unavailable with reason)
- `pnpm exec site-kernel run kernel.cache.clear --json` — cache must clear

### 4.2 Evidence artifacts

- Timing measurements for cold cache fill and warm cache runs (Step 13)
- `docs/rfcs/verification/rfc-0382.generated.json` — if acceptance probes are declared (RFC-0382 has no acceptance probes, so this is N/A)
- Commit messages referencing `RFC-0382` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Native module compatibility | Step 2: NoopCacheLayer fallback; Step 13: verify `kernel.cache.status` reports state |
| Cache staleness after git operations | Step 4: mtime + content hash via `@gogol/fingerprint`; hash mismatch triggers reparse |
| Manifest drift | Step 6: fallback to `listRegisteredKernelCommands` with warning; Step 11: regenerate manifest |
| Schema evolution | Step 3: `schema_version` column in `cache_entries`; Step 4: version mismatch triggers reparse |
| Agent misinterpretation | Step 14: AGENTS.md note; Step 5: `kernel.cache.status` reports `available: false` with reason |
| Concurrent execution | Step 3: WAL mode + 5s busy timeout |
| Cold cache fill time | Step 13: measure and verify under 90 seconds |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 (fingerprint governance), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0382 --reason "..." --invariant "DNA-53"` instead of working around it.
- If `better-sqlite3` cannot be installed on Windows despite prebuilt binaries, document the failure and proceed with NoopCacheLayer-only — the RFC explicitly accepts this as the degraded mode.
- If timing targets are not met after Phase 2, profile the cache layer to identify the remaining bottleneck. Do not weaken validation rules to meet timing targets.
