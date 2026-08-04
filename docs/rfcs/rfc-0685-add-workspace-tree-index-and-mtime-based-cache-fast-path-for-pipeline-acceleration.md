---
id: RFC-0685
title: "Add workspace tree index and mtime-based cache fast path for pipeline acceleration"
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
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0390
  - RFC-0637
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
  - DNA-35
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel"
successSignals:
  - "Pipeline cache check time reduced by >50% for cacheable commands on unchanged inputs"
  - "No semantic fingerprint computation when file mtimes are unchanged since last cache write"
  - "Workspace tree walked once per pipeline run instead of once per cacheable command"
  - "All existing cache hits remain valid — no cache schema version bump"
nonGoals:
  - "Does not change the command-result cache schema (RFC-0390 schema version stays at 1)"
  - "Does not introduce parallel pipeline step execution (covered by RFC-0686)"
  - "Does not modify the @warpgogol/fingerprint package itself — uses existing byte and semantic modes"
  - "Does not add file-watching or persistent daemon processes — the index is built per pipeline run"
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

# RFC-0685: Add workspace tree index and mtime-based cache fast path for pipeline acceleration

## Context

RFC-0390 introduced the command-result cache: before executing a cacheable pipeline step, the executor hashes the command's declared `reads[]` files and its module source, then checks the SQLite cache for a matching entry. This eliminates re-execution when inputs and code have not changed.

The cache-check path has three hotspots in `packages/os/site-kernel/src/cache/command-result-cache.ts`:

1. **`expandGlobs`** (lines 74–105): for each cacheable command, it walks the entire workspace root directory tree recursively (`walk(workspaceRoot)`), filtering entries against picomatch globs. With ~40 cacheable commands in `build.prepare`, this means **40 full recursive directory walks** of the monorepo per pipeline run.
2. **`computeInputsHash`** (lines 115–132): after glob expansion, every matched file is fingerprinted via `fingerprintFile(abs, { mode: "semantic" })`. Semantic mode parses TS/Astro/CSS ASTs for deterministic normalization — expensive for source files, unnecessary for `.md`/`.yaml`/`.json` content files where byte hashing is sufficient and 10–100× faster.
3. **`computeModuleHash`** (lines 145–177): when `modulePaths` is absent (the common case), the entire `site-kernel-checks/src/` directory is fingerprinted via `fingerprintTree` in semantic mode — a large directory with hundreds of files.

DNA-53 mandates that all project hashes use `@warpgogol/fingerprint`. This RFC does not change that — it changes _when_ and _how often_ fingerprinting is invoked, not the fingerprint package itself.

## Problem

The cache-check overhead is O(commands × workspace-tree-size). For a monorepo with ~40 cacheable commands and a workspace tree of ~10,000 files, each pipeline run performs ~40 full tree walks and ~N semantic fingerprint operations (where N is the total matched files across all `reads` declarations). On cache hits, the fingerprint work is pure overhead — the result is discarded because the cache entry matches.

Concretely:

- `expandGlobs` in `command-result-cache.ts:74–105` calls `readdir(dir, { withFileTypes: true })` recursively from `workspaceRoot` for **every** cacheable command. The `walk()` function has no memoization — it re-traverses `node_modules/`, `dist/`, `.git/`, and all package directories on every call.
- `computeInputsHash` in `command-result-cache.ts:115–132` calls `fingerprintFile(abs, { mode: "semantic" })` for every matched file. For `.md`, `.yaml`, `.json` files, semantic mode provides no normalization benefit over byte mode — the file is already canonical — but pays the AST parsing cost.
- There is no mtime-based fast path. Even if a file's content has not changed (same mtime + size as the last cache write), the full semantic fingerprint is recomputed to produce the same hash.

This makes the cache check itself a significant fraction of pipeline wall time, especially when most commands are cache hits (the common case during iterative development).

## Decision

The command-result cache layer gains three internal optimizations: (1) a per-pipeline workspace tree index that replaces N independent directory walks with one, (2) an mtime+size fast path that skips semantic fingerprinting when file metadata is unchanged since the last cache write, and (3) byte-mode fingerprinting for non-source file types (`.md`, `.yaml`, `.json`, `.txt`) where semantic normalization provides no benefit. No new commands are added — the optimizations are transparent to pipeline callers and do not change the cache schema version.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** This RFC does not bypass `@warpgogol/fingerprint` — it uses the existing `byteHash` and `fingerprintFile` APIs. The mtime fast path stores the previous fingerprint alongside the cache entry and reuses it when metadata is unchanged. The byte-mode selection for content files uses `fingerprintFile(abs, { mode: "byte" })`, which is already supported by the fingerprint package. No ad hoc hashing is introduced.
- **DNA-35 (`app.contract.full`):** By reducing cache-check overhead, the canonical readiness signal runs faster without weakening validation. All checks still execute on cache miss — only redundant fingerprint computation is eliminated.
- **RFC-0390 (Command-result cache):** The cache schema version stays at 1. The mtime table is stored as an auxiliary sidecar alongside the cache entry, not as a schema field. On cache miss, the old behavior is unchanged.
- **RFC-0637 (modulePaths):** This RFC complements RFC-0637. The mtime fast path applies to both `computeInputsHash` and `computeModuleHash`. ADR-0024 covers broader `modulePaths` adoption.
- **Site OS operator model:** No new commands. Changes are internal to `packages/os/site-kernel/src/cache/command-result-cache.ts` and `packages/os/site-kernel/src/runtime/execute-pipeline.ts`.

## Design

### Workspace tree index

The pipeline executor builds an in-memory `WorkspaceTreeIndex` once at the start of each pipeline run (in `executePipelineForSite` and `executePipelineForWorkspace`). The index is a `Map<posixPath, { mtimeMs, size }>` covering all files under `workspaceRoot`, excluding `.git/`, `node_modules/`, and `dist/` directories.

`expandGlobs` is refactored to accept the index instead of walking the filesystem. It filters the in-memory map against picomatch patterns, returning matched absolute paths. This replaces N directory walks with one.

The index is built using `readdir` with `withFileTypes: true`, skipping directories matching the exclusion set. For a ~10,000-file workspace, the single walk takes ~50–100ms; the current 40 walks take ~2–4s.

### mtime-based fast path

The cache entry stored by `setCachedCommandResult` gains an auxiliary `inputsMetadata` sidecar: a sorted array of `{ path, mtimeMs, size }` for all files that were fingerprinted. On the next `tryCacheRead`, before computing `computeInputsHash`, the executor checks:

1. Expand globs using the tree index to get the current file list.
2. Compare the current `{ path, mtimeMs, size }` array against the stored `inputsMetadata`.
3. If identical (same files, same mtimes, same sizes), reuse the stored `inputsHash` without fingerprinting.
4. If any file differs, fall back to full `computeInputsHash`.

The sidecar is stored in the same SQLite cache namespace, keyed by the same cache key, in a separate column. On cache miss, no sidecar is read.

### Byte-mode for content files

`computeInputsHash` selects fingerprint mode per file based on extension:

| Extension | Mode | Rationale |
| --- | --- | --- |
| `.ts`, `.tsx`, `.astro`, `.css`, `.js`, `.mjs` | semantic | AST normalization needed for deterministic hashing |
| `.md`, `.yaml`, `.yml`, `.json`, `.jsonc`, `.txt` | byte | Content is already canonical; semantic parsing is overhead |
| All others | byte | No semantic parser available; byte mode is the fallback |

This uses the existing `fingerprintFile(abs, { mode: "byte" })` API — no new fingerprint modes are added.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/cache/workspace-tree-index.ts

export interface WorkspaceTreeEntry {
  mtimeMs: number;
  size: number;
}

export type WorkspaceTreeIndex = Map<string, WorkspaceTreeEntry>;

export async function buildWorkspaceTreeIndex(
  workspaceRoot: string,
  excludeDirs?: string[],
): Promise<WorkspaceTreeIndex>;

export function filterTreeIndex(
  index: WorkspaceTreeIndex,
  patterns: string[],
  baseDir: string,
  workspaceRoot: string,
): string[];
```

```ts
// packages/os/site-kernel/src/cache/command-result-cache.ts (modified)

interface InputsMetadataEntry {
  path: string;
  mtimeMs: number;
  size: number;
}

interface CachedCommandResultEntry {
  data: KernelExecutionReport;
  inputsMetadata?: InputsMetadataEntry[];
  inputsHash: string;
}

export async function computeInputsHash(
  reads: string[],
  baseDir: string,
  workspaceRoot: string,
  treeIndex?: WorkspaceTreeIndex,
): Promise<string>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/cache/workspace-tree-index.ts` | New module: tree index builder and filter |
| `packages/os/site-kernel/src/cache/command-result-cache.ts` | Modified: accepts tree index, mtime fast path, byte-mode selection |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Modified: builds tree index once per pipeline run, passes to cache functions |
| `packages/os/site-kernel/src/cache/cache-layer.ts` | Modified: stores/retrieves `inputsMetadata` sidecar |

### Failure modes

- **Tree index build failure**: if `readdir` fails on the workspace root, the executor falls back to the current per-command `expandGlobs` behavior. The pipeline does not fail due to index build issues.
- **mtime collision**: if two different file contents share the same mtime+size (extremely rare with nanosecond-resolution mtimes on Linux), the cache returns a stale entry. This is the same risk as any mtime-based cache and is acceptable because the next `--force` run recomputes.
- **Byte-mode hash mismatch**: if a content file (`.md`, `.yaml`) is normalized by a preprocessor before fingerprinting, byte mode may produce a different hash than semantic mode. This is not a problem because the cache key includes both `inputsHash` and `moduleHash` — a switch from semantic to byte mode produces a new `inputsHash`, causing a cache miss (not a false hit). The first run after implementation recomputes all caches.

## Rollout

- **Default behavior**: the tree index, mtime fast path, and byte-mode selection are enabled by default. No opt-in flag is needed — the optimizations are transparent and produce identical cache hit/miss decisions.
- **First run after implementation**: all existing cache entries are misses because `inputsHash` values change (byte mode produces different hashes than semantic mode for content files). The first pipeline run repopulates the cache. This is a one-time cost.
- **No cache schema migration**: the `inputsMetadata` sidecar is stored in a new SQLite column. Old entries without the sidecar simply trigger a full `computeInputsHash` on the next read, then are updated with the sidecar.
- **No pipeline changes**: `build.prepare`, `build.check`, and `build.post` step definitions are unchanged. The optimizations are internal to the cache layer.
- **`--force` flag**: bypasses all cache reads as before. The tree index is still built (it's needed for glob expansion), but the mtime fast path is not used.

## Alternatives considered

- **File watcher daemon**: a persistent process that watches the workspace and maintains a live tree index. Rejected because it adds operational complexity (process lifecycle, crash recovery) for a problem that can be solved with a one-shot walk per pipeline run (~50–100ms).
- **Git-based tree index**: use `git ls-files` to enumerate tracked files instead of `readdir`. Rejected because the pipeline also needs mtime+size (not just paths), and `git ls-files` does not provide metadata. Additionally, untracked files (e.g. generated content in workpieces) would be missed.
- **Persistent mtime database**: store mtimes in a SQLite table that persists across pipeline runs. Rejected because cross-run mtime comparison is unreliable (clock skew, file replacement with same mtime). The per-run index is safer and only ~50ms.
- **Semantic mode for all files**: keep the current behavior but memoize fingerprint results within a pipeline run. Rejected because it doesn't solve the N directory walks problem, and semantic fingerprinting of content files is still wasted work even when memoized.

## Risks

- **Stale cache on mtime collision**: two file writes within the same filesystem mtime tick (1ns on ext4) with identical sizes could produce a false cache hit. Probability is negligible on modern Linux filesystems. Mitigation: `--force` flag recomputes all caches.
- **Byte-mode hash divergence**: switching from semantic to byte mode for content files changes `inputsHash` values, causing a one-time cache flush. This is expected and not a risk — it's a one-time cost on first run after implementation.
- **Agent misinterpretation**: agents might think this RFC changes the cache schema or requires cache migration. It does not — the schema version stays at 1, and old entries are transparently upgraded.
- **Memory usage**: the tree index for a ~10,000-file workspace uses ~1–2MB of memory (Map of string→{number, number}). This is negligible and freed after the pipeline run.
- **Exclusion list drift**: if new top-level directories are added to the workspace that should be excluded (e.g. `.cache/`), they must be added to the exclusion list. The default exclusion set covers `.git/`, `node_modules/`, and `dist/`.

## Acceptance criteria

- [ ] `WorkspaceTreeIndex` type and `buildWorkspaceTreeIndex` function defined in `packages/os/site-kernel/src/cache/workspace-tree-index.ts`
- [ ] `expandGlobs` in `command-result-cache.ts` accepts a `WorkspaceTreeIndex` parameter and filters in-memory instead of walking the filesystem
- [ ] `executePipelineForSite` and `executePipelineForWorkspace` in `execute-pipeline.ts` build the tree index once per pipeline run and pass it to `tryCacheRead`/`tryCacheWrite`
- [ ] `computeInputsHash` uses byte-mode fingerprinting for `.md`, `.yaml`, `.yml`, `.json`, `.jsonc`, `.txt` files and semantic mode for source files
- [ ] `setCachedCommandResult` stores `inputsMetadata` sidecar (sorted `{ path, mtimeMs, size }` array) alongside the cache entry
- [ ] `tryCacheRead` compares current file metadata against stored `inputsMetadata` and reuses the stored `inputsHash` when unchanged, skipping fingerprint computation
- [ ] Unit tests verify: (a) tree index produces same glob matches as filesystem walk, (b) mtime fast path reuses hash on unchanged files, (c) byte-mode selection per extension, (d) fallback to full fingerprint on mtime change
- [ ] `build:check` passes on `@warpgogol/site-kernel`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The tree index exclusion set MUST include at minimum: `.git/`, `node_modules/`, `dist/`. Additional exclusions MAY be added but MUST be documented in the `buildWorkspaceTreeIndex` function.
- The mtime fast path MUST NOT be used when `--force` is set — `--force` bypasses all cache reads.
- The byte-mode selection table is closed: adding new extensions to the semantic-mode set requires a new RFC. Adding extensions to the byte-mode set is allowed without RFC if the file type has no semantic normalizer in `@warpgogol/fingerprint`.
