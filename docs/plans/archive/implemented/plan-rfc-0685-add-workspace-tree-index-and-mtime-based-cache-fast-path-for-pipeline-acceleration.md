---
rfcId: RFC-0685
planId: PLAN-RFC-0685-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel"
  services: []
  docs:
    - packages/os/site-kernel/AGENTS.md
---

# Implementation Plan: RFC-0685

## 1. Objectives

- [ ] O1 — Create `WorkspaceTreeIndex` type and `buildWorkspaceTreeIndex` function (maps to acceptance criterion a)
- [ ] O2 — Refactor `expandGlobs` to filter in-memory from tree index (maps to acceptance criterion b)
- [ ] O3 — Wire tree index into `executePipelineForSite` and `executePipelineForWorkspace` (maps to acceptance criterion c)
- [ ] O4 — Implement byte-mode fingerprinting for content files in `computeInputsHash` (maps to acceptance criterion d)
- [ ] O5 — Store `inputsMetadata` sidecar in cache entries via `setCachedCommandResult` (maps to acceptance criterion e)
- [ ] O6 — Implement mtime fast path in `tryCacheRead` (maps to acceptance criterion f)
- [ ] O7 — Write unit tests for tree index, mtime fast path, byte-mode, and fallback (maps to acceptance criterion g)
- [ ] O8 — Update `packages/os/site-kernel/AGENTS.md` § "Command-result cache" (maps to acceptance criterion j)
- [ ] O9 — Pass `build:check` and `rfc.validate` (maps to acceptance criteria h, k)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/cache/workspace-tree-index.ts` — **New file**: `WorkspaceTreeEntry`, `WorkspaceTreeIndex`, `buildWorkspaceTreeIndex`, `filterTreeIndex`
- `packages/os/site-kernel/src/cache/command-result-cache.ts` — **Modified**: `expandGlobs` accepts tree index, `computeInputsHash` selects byte/semantic mode per extension, `setCachedCommandResult` stores `inputsMetadata` wrapper, `getCachedCommandResult` unwraps and returns `inputsMetadata`, new `InputsMetadataEntry` and `CachedCommandResultEntry` types
- `packages/os/site-kernel/src/runtime/execute-pipeline.ts` — **Modified**: `executePipelineForSite` and `executePipelineForWorkspace` build tree index once per run, pass it to `tryCacheRead`/`tryCacheWrite`; `tryCacheRead` implements mtime fast path comparison; `tryCacheWrite` collects and stores `inputsMetadata`
- `packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts` — **Modified**: add test cases for byte-mode selection, tree index glob equivalence, mtime fast path, fallback
- `packages/os/site-kernel/src/cache/__tests__/workspace-tree-index.test.ts` — **New file**: unit tests for `buildWorkspaceTreeIndex` and `filterTreeIndex`

### 2.2 Configuration and data

- No configuration changes. No YAML/JSON/manifest changes. Cache DB schema unchanged (schema version stays at 1).

### 2.3 Documentation and specs

- `packages/os/site-kernel/AGENTS.md` — update § "Command-result cache (RFC-0390)" with mtime fast path, byte-mode selection, and tree index documentation

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel run build:check` — TypeScript strict mode
- `pnpm --filter @warpgogol/site-kernel run test` — vitest unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0685` — RFC mechanical validation

## 3. Step sequence

### Step 1. Create `workspace-tree-index.ts` module

**Goal:** Create the new module with `WorkspaceTreeEntry`, `WorkspaceTreeIndex`, `buildWorkspaceTreeIndex`, and `filterTreeIndex`.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/workspace-tree-index.ts`
- Define `WorkspaceTreeEntry` interface: `{ mtimeMs: number; size: number }`
- Define `WorkspaceTreeIndex` type: `Map<string, WorkspaceTreeEntry>` (key = POSIX-relative path from workspaceRoot)
- Implement `buildWorkspaceTreeIndex(workspaceRoot: string, excludeDirs?: string[])`: walk `workspaceRoot` recursively using `readdir({ withFileTypes: true })`, skip directories matching `excludeDirs` (default: `[".git", "node_modules"]`), call `stat()` per file to collect `mtimeMs` and `size`, store in Map keyed by POSIX-relative path
- Implement `filterTreeIndex(index, patterns, baseDir, workspaceRoot)`: resolve patterns (including `<app>` token), compile picomatch matcher, filter index keys against matcher, return sorted absolute paths
- Add Compass MODULE_CONTRACT and CHANGE_SUMMARY headers

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes with the new file

**Completion criterion:** `workspace-tree-index.ts` exists, exports `WorkspaceTreeEntry`, `WorkspaceTreeIndex`, `buildWorkspaceTreeIndex`, `filterTreeIndex`; `build:check` passes

**Human review:** no

---

### Step 2. Refactor `expandGlobs` and `computeInputsHash` in `command-result-cache.ts`

**Goal:** Make `expandGlobs` accept an optional `WorkspaceTreeIndex` and filter in-memory. Add byte-mode selection per extension in `computeInputsHash`.

**Agent actions:**

- Add `InputsMetadataEntry` interface: `{ path: string; mtimeMs: number; size: number }`
- Add `CachedCommandResultEntry` interface: `{ report: KernelExecutionReport; inputsMetadata?: InputsMetadataEntry[]; inputsHash: string }`
- Add `BYTE_MODE_EXTENSIONS` constant: `[".md", ".yaml", ".yml", ".json", ".jsonc", ".txt"]`
- Add `SEMANTIC_MODE_EXTENSIONS` constant: `[".ts", ".tsx", ".astro", ".css", ".js", ".mjs"]`
- Add helper `selectFingerprintMode(absPath: string): "byte" | "semantic"` — returns `"byte"` for `BYTE_MODE_EXTENSIONS`, `"semantic"` for `SEMANTIC_MODE_EXTENSIONS`, `"byte"` for all others
- Modify `expandGlobs` to accept optional `treeIndex?: WorkspaceTreeIndex` parameter. When provided, call `filterTreeIndex` instead of walking the filesystem. When absent, fall back to current `walk()` behavior
- Modify `computeInputsHash` to accept optional `treeIndex?: WorkspaceTreeIndex` parameter, pass it to `expandGlobs`. Use `selectFingerprintMode(abs)` instead of hardcoded `{ mode: "semantic" }`. Also collect `inputsMetadata` (sorted array of `{ path, mtimeMs, size }`) and return both `inputsHash` and `inputsMetadata` — change return type to `Promise<{ hash: string; metadata: InputsMetadataEntry[] }>`
- Update `expandGlobs` call site inside `computeInputsHash` to pass `treeIndex`
- Update MODULE_CONTRACT and CHANGE_SUMMARY

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes

**Completion criterion:** `expandGlobs` accepts `treeIndex` parameter; `computeInputsHash` uses byte-mode for content extensions and returns metadata; `build:check` passes

**Human review:** no

---

### Step 3. Modify `getCachedCommandResult` and `setCachedCommandResult` for wrapper format

**Goal:** Store and retrieve `inputsMetadata` alongside the report in the cache `data` payload.

**Agent actions:**

- Modify `setCachedCommandResult` to accept `inputsMetadata: InputsMetadataEntry[]` and `inputsHash: string` parameters. Store `data` as `{ report, inputsMetadata, inputsHash }` wrapper object instead of bare `KernelExecutionReport`
- Modify `getCachedCommandResult` to unwrap the `data` field: if `data` has `report` and `inputsMetadata` fields, return `{ report: data.report, inputsMetadata: data.inputsMetadata, inputsHash: data.inputsHash }`. If `data` is a bare `KernelExecutionReport` (legacy), return `{ report: data, inputsMetadata: undefined, inputsHash: undefined }`
- Change return type of `getCachedCommandResult` to `Promise<{ report: KernelExecutionReport; inputsMetadata?: InputsMetadataEntry[]; inputsHash?: string } | null>`
- Update existing tests in `command-result-cache.test.ts` to handle the new return shape (`.report` access)
- Update MODULE_CONTRACT and CHANGE_SUMMARY

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes
- `pnpm --filter @warpgogol/site-kernel run test` passes (existing tests updated)

**Completion criterion:** `setCachedCommandResult` stores wrapper with `inputsMetadata`; `getCachedCommandResult` unwraps and returns metadata; existing tests pass with updated assertions

**Human review:** no

---

### Step 4. Implement mtime fast path in `tryCacheRead` and update `tryCacheWrite`

**Goal:** In `execute-pipeline.ts`, use the tree index for glob expansion, compare current file metadata against stored `inputsMetadata`, and reuse stored `inputsHash` when unchanged.

**Agent actions:**

- Import `buildWorkspaceTreeIndex` and `filterTreeIndex` in `execute-pipeline.ts`
- Import `selectFingerprintMode` or `BYTE_MODE_EXTENSIONS` if needed
- In `executePipelineForSite`: after creating `cache` and `moduleHashCache`, call `buildWorkspaceTreeIndex(options.workspaceRoot)` — wrap in try/catch, fall back to `undefined` on failure. Store in `const treeIndex`
- In `executePipelineForWorkspace`: same tree index build
- Modify `tryCacheRead` to accept `treeIndex: WorkspaceTreeIndex | undefined` parameter. When reading cache entry:
  - If entry has `inputsMetadata` and `inputsHash`: expand globs using `treeIndex` to get current file list with metadata. Compare current metadata array against stored `inputsMetadata`. If identical, skip `computeInputsHash` and use stored `inputsHash` directly for cache key lookup
  - If entry has no `inputsMetadata` (legacy): proceed with full `computeInputsHash` as before
- Modify `tryCacheWrite` to accept `treeIndex` parameter. After computing `inputsHash`, also collect `inputsMetadata` from `computeInputsHash` return value. Pass `inputsMetadata` and `inputsHash` to `setCachedCommandResult`
- Update all `tryCacheRead` and `tryCacheWrite` call sites in both `executePipelineForSite` and `executePipelineForWorkspace` to pass `treeIndex`
- Ensure `--force` still bypasses cache reads (fast path not used)
- Update CHANGE_SUMMARY

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes
- `pnpm --filter @warpgogol/site-kernel run test` passes

**Completion criterion:** `tryCacheRead` compares metadata and reuses stored hash on match; `tryCacheWrite` stores metadata; both pipeline functions build tree index once and pass it through; `build:check` and tests pass

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create comprehensive unit tests covering all four acceptance test scenarios.

**Agent actions:**

- Create `packages/os/site-kernel/src/cache/__tests__/workspace-tree-index.test.ts`:
  - Test `buildWorkspaceTreeIndex` produces correct Map with mtimeMs and size
  - Test `buildWorkspaceTreeIndex` excludes `.git/` and `node_modules/` by default
  - Test `buildWorkspaceTreeIndex` does NOT exclude `dist/` (files in dist/ appear in index)
  - Test `filterTreeIndex` produces same results as filesystem walk for picomatch patterns
  - Test `filterTreeIndex` resolves `<app>` token correctly
- Update `packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts`:
  - Test `computeInputsHash` with tree index produces same hash as without tree index
  - Test `computeInputsHash` uses byte mode for `.md`, `.yaml`, `.json`, `.txt` (verify via hash consistency with `fingerprintFile(abs, { mode: "byte" })`)
  - Test `computeInputsHash` uses semantic mode for `.ts` (verify hash differs from byte mode)
  - Test mtime fast path: store entry with `inputsMetadata`, read with unchanged files → reuses stored `inputsHash`
  - Test mtime fast path fallback: modify file mtime → falls back to full `computeInputsHash`
  - Test legacy entry detection: bare `KernelExecutionReport` in cache → no fast path, full recompute
  - Test `setCachedCommandResult` stores wrapper with `inputsMetadata`
  - Test `getCachedCommandResult` unwraps legacy and new formats

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run test` — all tests pass

**Completion criterion:** All test cases pass; tests cover tree index glob equivalence, mtime fast path reuse, byte-mode selection, and fallback on mtime change

**Human review:** no

---

### Step 6. Update AGENTS.md documentation

**Goal:** Update the "Command-result cache (RFC-0390)" section in `packages/os/site-kernel/AGENTS.md`.

**Agent actions:**

- Add documentation for:
  - Workspace tree index: built once per pipeline run, excludes `.git/` and `node_modules/` only, includes `dist/` and `missions/`
  - mtime fast path: stores `inputsMetadata` sidecar in cache `data` payload, reuses stored `inputsHash` when file metadata unchanged, `--force` bypasses fast path
  - Byte-mode selection: `.md`, `.yaml`, `.yml`, `.json`, `.jsonc`, `.txt` use byte mode; `.ts`, `.tsx`, `.astro`, `.css`, `.js`, `.mjs` use semantic mode; all others use byte mode
  - Legacy entry handling: bare `KernelExecutionReport` entries detected and transparently upgraded
  - No schema version change (stays at 1)

**Validation:**

- `git diff packages/os/site-kernel/AGENTS.md` shows the new documentation

**Completion criterion:** AGENTS.md § "Command-result cache" includes tree index, mtime fast path, and byte-mode documentation

**Human review:** no

---

### Step 7. Final validation, review, fix, and stamp

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel run build:check`
- Run `pnpm --filter @warpgogol/site-kernel run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0685`
- Check off acceptance criteria in the RFC file (mark `[x]` with evidence)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Stamp: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0685 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `rfc.validate` passes
- `build:check` passes
- `test` passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All validation passes; acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0685`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0685` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stale cache on mtime collision | Step 5 tests fallback on mtime change; `--force` bypasses fast path (Step 4) |
| Byte-mode hash divergence | Step 5 tests verify byte-mode hash consistency; first run flushes cache (documented in RFC) |
| Agent misinterpretation | Step 6 AGENTS.md update documents that schema version stays at 1 |
| Memory usage (~1–2MB) | Acceptable — index is per-run, freed after pipeline completion |
| Exclusion list drift | Step 1 documents default exclusions (`.git/`, `node_modules/` only); Step 6 AGENTS.md documents the exclusion policy |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 or DNA-35, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0685 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `computeInputsHash` return type change breaks downstream consumers not identified during planning, stop and assess whether a compatibility wrapper is needed (forward-only: no wrapper, update all consumers).
