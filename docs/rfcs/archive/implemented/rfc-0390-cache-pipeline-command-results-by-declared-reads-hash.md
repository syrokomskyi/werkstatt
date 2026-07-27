---
id: RFC-0390
title: "Cache pipeline command results by declared reads hash"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-17
updatedAt: 2026-07-19
enhancedAt: 2026-07-17
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0266
  - RFC-0382
amendedBy: []
related:
  - RFC-0230
  - RFC-0266
  - RFC-0270
  - RFC-0364
  - DNA-53
satisfies:
  - DNA-53
commands:
  proposed:
    - command.reads.validate
  added:
    - command.reads.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/fingerprint"
successSignals:
  - "build.check pipeline skips unchanged commands on warm cache (visible SKIP (cached) in progress output)"
  - "kernel.cache.status reports command_results namespace hit ratio"
  - "command.reads.validate passes for all registered commands in the ecosystem"
  - "--force flag bypasses cache and re-executes all pipeline steps"
  - "kernel.cache.clear --namespace command_results resets cached results"
nonGoals:
  - "Do not cache astro build or astro check results — only site-kernel pipeline commands are cached"
  - "Do not cache single command invocations (site-kernel run <cmd>) — only pipeline executions use the cache"
  - "Do not cache dry-run pipeline executions"
  - "Do not introduce a new cache backend — reuse the existing CacheLayer (RFC-0382, SQLite)"
  - "Do not change the reads/writes contract semantics defined by RFC-0266 — only add functional enforcement"
  - "Do not cache commands marked cacheable: false"
  - "Do not add path-existence checks to command.reads.validate (glob patterns may match zero files legitimately)"
---

# RFC-0390: Cache pipeline command results by declared reads hash

## Context

The `build:check` pipeline for a site workpiece (e.g. `webgogol-com`) executes 176 sequential site-kernel commands via `executePipelineForSite` in `packages/os/site-kernel/src/runtime/execute-pipeline.ts`. Each command reads files from the site directory (system.md, content, manifests, schemas) and produces a `KernelExecutionReport`. The pipeline is fail-fast: the first failing step aborts the entire pipeline.

A full `build:check` run takes hours because every command re-executes on every run, even when none of the files the command reads have changed since the last successful execution. Turbo's `cache: false` for `build:check` tasks (`turbo.json`) means the task itself is never cached by Turbo, and the 176 commands inside the pipeline have no caching layer at all.

RFC-0382 introduced a `CacheLayer` with SQLite storage (`.cache/kernel-cache.db`) and per-file mtime + contentHash invalidation. Currently this cache is used only for RFC frontmatter entries (`rfc_entries` namespace). The infrastructure is ready to be extended.

RFC-0266 introduced the `reads?: string[]` field on `KernelCommandDefinition` — workspace-root-relative path globs declaring which files a command reads. The field is currently "declarative/documentary only" per RFC-0266. Some commands already declare `reads` (notably in `command-tables/30-check-webgogol.ts`, `command-tables/32-analytics-matomo.ts`, `command-tables/infra-contracts.ts`), but the majority of the 176 pipeline commands do not.

`@gogol/fingerprint` (RFC-0364, DNA-53) provides `fingerprintTree` and `fingerprintFile` — semantic and byte-level file hashing with parser-backed normalizers. All project hashes must use this package (DNA-53).

## Problem

1. **No command-level result caching.** 176 pipeline commands re-execute fully on every `build:check` run, even when their inputs are unchanged. This makes iterative development impractical — a single content edit triggers a full multi-hour pipeline.

2. **`reads` is decorative.** RFC-0266 declared `reads` as documentary-only. There is no automated enforcement that commands declare `reads`, and no functional use of the declared globs. The field exists but does nothing.

3. **No cache invalidation contract for command results.** The `CacheLayer` (RFC-0382) has no namespace for command execution results. There is no mechanism to skip a command whose inputs (declared `reads` + command module source) have not changed since the last execution.

## Decision

The kernel pipeline executor gains a command-result cache that skips re-execution of pipeline steps whose declared `reads` inputs and command module source have not changed since the last cached execution.

The existing `reads?: string[]` field on `KernelCommandDefinition` (RFC-0266) becomes the functional cache input declaration. Every registered command MUST declare either `reads: string[]` (non-empty, syntactically valid picomatch globs) or `cacheable: false`. A new workspace-scoped command `command.reads.validate` enforces this contract and is added to `PACKAGES_CHECK_PIPELINE`.

The cache reuses the existing `CacheLayer` (RFC-0382) with a new namespace `command_results`. Cache keys include a schema version constant, the command name, the site name (for app-scoped commands), a hash of the declared `reads` file contents (via `@gogol/fingerprint`), and a hash of the command module's `src/` directory. Cached values are full `KernelExecutionReport` objects with a `cached: true` marker.

Caching is enabled by default. The `--force` flag bypasses the cache for a full re-execution. `dryRun` mode always bypasses the cache. Only successful results (`ok: true`) are cached — failed commands (`ok: false`) are never stored, ensuring transient failures (file locks, race conditions) are re-attempted on the next run.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** All file hashing for cache keys uses `@gogol/fingerprint` — `fingerprintTree` for directory hashes, `fingerprintFile` for individual files, `stableJsonHash` for composite keys. No ad-hoc hashing.
- **RFC-0266 (Command manifest):** This RFC amends RFC-0266 by turning `reads` from declarative-only into a functional cache input. The `<app>` token resolution and workspace-root-relative semantics remain unchanged.
- **RFC-0382 (SQLite cache):** This RFC amends RFC-0382 by adding the `command_results` namespace and extending the cache layer usage beyond RFC frontmatter.
- **RFC-0270 (Pipeline telemetry):** Cached steps record `durationMs: 0` in telemetry, with a `cached` status. The timing summary distinguishes cached from executed steps.
- **Site OS operator model:** `command.reads.validate` is workspace-scoped, added to `PACKAGES_CHECK_PIPELINE` in `tools/kernel.config.ts`. It runs once per workspace, not per site.

## Design

### CLI surface

```sh
# Normal pipeline run — cache active, unchanged commands skipped
pnpm exec site-kernel pipeline build.check --site webgogol-com

# Force full re-execution, bypass cache
pnpm exec site-kernel pipeline build.check --site webgogol-com --force

# Validate that all registered commands declare reads or cacheable: false
pnpm exec site-kernel run command.reads.validate

# Clear command result cache
pnpm exec site-kernel run kernel.cache.clear --namespace command_results

# Check cache status (includes command_results namespace)
pnpm exec site-kernel run kernel.cache.status
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts — existing field, new semantics

export interface KernelCommandDefinition<TData = unknown> extends KernelCommandMetadata {
  name: string;
  flags?: Record<string, KernelFlagSpec>;
  /**
   * RFC-0266: workspace-root-relative path globs this command reads.
   * RFC-0390: now the functional cache input declaration. When non-empty,
   * the pipeline executor hashes matching files via @gogol/fingerprint
   * and skips re-execution on cache hit. The literal token "<app>" stands
   * in for the app-scoped root on app-scope commands.
   */
  reads?: string[];
  writes?: string[];
  execute(
    input: KernelCommandInput,
    context: KernelRuntimeContext,
  ): Promise<void | KernelCommandResult<TData>> | void | KernelCommandResult<TData>;
}

// packages/os/site-kernel/src/types.ts — KernelCommandMetadata extension

export interface KernelCommandMetadata {
  description: string;
  scope: KernelCommandScope;
  mutatesState?: boolean;
  requiresNetwork?: boolean;
  supportsAllSites?: boolean;
  timeoutMs?: number;
  expectedDurationMs?: number;
  longRunning?: boolean;
  /**
   * RFC-0390: when false, the pipeline executor never caches this command's
   * result. Required for commands that depend on external state (network,
   * secrets, time). Commands without `reads` MUST set this to false;
   * command.reads.validate enforces this. Defaults to true.
   */
  cacheable?: boolean;
}

// packages/os/site-kernel/src/cache/command-result-cache.ts — new module

export const COMMAND_RESULT_CACHE_NAMESPACE = "command_results";
export const COMMAND_RESULT_CACHE_SCHEMA_VERSION = 1;

export interface CommandResultCacheKey {
  commandName: string;
  siteName: string | null;
  inputsHash: string;
  moduleHash: string;
}

export function buildCommandResultCacheKey(key: CommandResultCacheKey): string {
  return `${COMMAND_RESULT_CACHE_SCHEMA_VERSION}:${key.commandName}:${key.siteName ?? "ws"}:${key.inputsHash}:${key.moduleHash}`;
}

export async function computeInputsHash(
  reads: string[],
  baseDir: string,
): Promise<string> {
  // Resolve <app> token, expand globs via picomatch, hash matching files
  // via @gogol/fingerprint (fingerprintFile / fingerprintTree).
  // Returns stableJsonHash of { path, hash } pairs.
}

export async function computeModuleHash(
  moduleSrcDir: string,
): Promise<string> {
  // fingerprintTree of the command's package src/ directory.
  // Cached per-pipeline-run (computed once per package, not per command).
}

export async function getCachedCommandResult(
  cache: CacheLayer,
  key: string,
): Promise<KernelExecutionReport | null> {
  // cache.get(COMMAND_RESULT_CACHE_NAMESPACE, key)
  // Deserialize KernelExecutionReport, set cached: true
}

export async function setCachedCommandResult(
  cache: CacheLayer,
  key: string,
  report: KernelExecutionReport,
): Promise<void> {
  // cache.set(COMMAND_RESULT_CACHE_NAMESPACE, key, report, mtime, contentHash)
}

// packages/os/site-kernel/src/runtime/execute-pipeline.ts — integration point

// In executePipelineForSite and executePipelineForWorkspace:
// Before executeRegisteredCommand:
//   1. Check command.cacheable (default true) and dryRun
//   2. Resolve reads globs relative to baseDir (site directory or workspaceRoot)
//   3. Compute inputsHash via computeInputsHash
//   4. Compute moduleHash via computeModuleHash (cached per package per run)
//   5. Build cache key, query CacheLayer
//   6. On hit: return cached report with cached: true, status "skipped (cached)"
//   7. On miss: execute command, store result in cache, return report
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Add `cacheable` to `KernelCommandMetadata`; update `reads` JSDoc |
| `packages/os/site-kernel/src/cache/command-result-cache.ts` | New module: cache key construction, inputs/module hash computation, get/set helpers |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Integrate cache lookup/store in `executePipelineForSite` and `executePipelineForWorkspace` |
| `packages/os/site-kernel/src/cache/cache-module.ts` | No change — `kernel.cache.status` and `kernel.cache.clear` already enumerate namespaces |
| `packages/os/site-kernel-checks/src/command-tables/*.ts` | Add `reads` to all commands that lack it; add `cacheable: false` to network-dependent commands |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Add `command.reads.validate` step |
| `packages/os/site-kernel/package.json` | Add `picomatch` dependency |
| `packages/os/site-kernel/AGENTS.md` | Extend "Kernel cache" section with command-result cache documentation |
| `packages/os/site-kernel-checks/AGENTS.md` | Document mandatory `reads`/`cacheable` contract for command authors |
| `docs/requirements.xml` | Add requirement: pipeline command results cached by declared reads hash |
| `docs/technology.xml` | Add picomatch entry to changelog-os tooling section |
| `.cache/kernel-cache.db` | SQLite DB — `command_results` namespace added automatically |

### Output format

```json
{
  "command": "naming.convention.lint",
  "status": "pass",
  "cached": true,
  "summary": "Cached: pass (inputs unchanged)",
  "timing": {
    "durationMs": 0,
    "exceededTimeout": false
  }
}
```

Progress output (stderr):

```
[1/176] naming.convention.lint …
[1/176] naming.convention.lint — SKIP (cached) 0s
[2/176] content.surface.validate …
[2/176] content.surface.validate — OK 1.2s
```

### Failure modes

- **Cache hit with `ok: false`:** Cannot occur — failed commands are never cached. Only `ok: true` results are stored. A previously-failing command will re-execute on every run until it succeeds, at which point its result is cached.
- **`cacheable: false` command:** Always executed, never cached. No cache lookup, no cache store.
- **`reads` not declared and `cacheable` not false:** `command.reads.validate` fails with `CRC-01: Command "<name>" must declare reads or cacheable: false`.
- **Invalid glob pattern in `reads`:** `command.reads.validate` fails with `CRC-02: Command "<name>" has invalid glob pattern in reads: "<pattern>"`.
- **Cache unavailable (no better-sqlite3):** Graceful degradation — cache always misses, all commands execute normally. No failure.
- **`--force` flag:** All cache lookups bypassed, all commands execute. Results are still written to cache (refreshing entries).
- **`dryRun` mode:** Cache fully bypassed (no read, no write). Commands execute in dry-run mode as before.
- **Concurrent pipeline executions:** The SQLite cache uses WAL mode with `busy_timeout=5000` (established by RFC-0382, `technology.xml` entry `cos-02`). Two agents running `build:check` simultaneously will both read from the cache; write contention on the same key is handled by WAL's last-writer-wins semantics and the busy timeout. No retry logic is needed — the cache is advisory, not authoritative.

## Rollout

- **Default behavior on introduction:** Cache is enabled by default for all pipeline executions. Commands without `reads` and without `cacheable: false` are not cached (they execute normally), but `command.reads.validate` will fail for them.
- **Cache warming:** The first pipeline run after implementation will cache-miss on all 176 commands and execute normally — same duration as today. Only subsequent runs benefit from the cache. There is no separate warm-up command; the cache fills naturally during normal pipeline execution.
- **Existing apps adoption:** All 176 commands in `SITES_CHECK_AUTHOR_PIPELINE` and all commands in `PACKAGES_CHECK_PIPELINE` must be annotated with `reads` or `cacheable: false` before this RFC can be marked implemented. This is a one-time bulk annotation pass.
- **New apps:** Automatically comply — `command.reads.validate` is in `PACKAGES_CHECK_PIPELINE`, so new commands without `reads` fail the build.
- **Cache invalidation:** `kernel.cache.clear --namespace command_results` clears all cached results. `COMMAND_RESULT_CACHE_SCHEMA_VERSION` bump invalidates all entries on code change.
- **Pipeline integration:** `command.reads.validate` is added to `PACKAGES_CHECK_PIPELINE` in `tools/kernel.config.ts`. No change to `SITES_BUILD_CHECK_PIPELINE` — caching is transparent to the pipeline definition.
- **Compass sync:** `docs/requirements.xml` gains a requirement entry for command-level result caching. `docs/technology.xml` gains a `picomatch` entry. The existing `better-sqlite3` entry (`cos-02`) already covers WAL mode and busy_timeout — no change needed there.
- **AGENTS.md updates:** `packages/os/site-kernel/AGENTS.md` "Kernel cache" section is extended with command-result cache documentation. `packages/os/site-kernel-checks/AGENTS.md` documents the mandatory `reads`/`cacheable` contract for command authors.

## Alternatives considered

- **Auto-tracking via `context.io` interception:** Wrap `readFile` in `createDefaultIO()` to collect read paths automatically. Rejected because many commands use direct `node:fs/promises` imports, not `context.io`, so tracking would be incomplete. Also requires monkey-patching or IO abstraction adoption across all commands.
- **New `inputs` field instead of reusing `reads`:** Rejected because `reads` already exists (RFC-0266), some commands already declare it, and the `<app>` token resolution is already defined. Adding a parallel field would create confusion and duplication.
- **Full `KernelExecutionReport` caching vs. pass/fail only:** Rejected pass/fail-only because cached failures would lose diagnostic output (logs, violations), making cache hits less useful than real executions.
- **Import-graph analysis for module hash:** Rejected as over-engineering. Hashing the entire `src/` directory of the command's package is simpler and safer (any change invalidates all commands in that package, which is acceptable).
- **Turbo cache for `build:check`:** Rejected because `turbo.json` has `cache: false` for `build:check` tasks by design — the 176 internal commands are not visible to Turbo. Our cache operates inside the process, orthogonal to Turbo's task-level cache.
- **File-based cache (JSON files on disk):** Rejected because the `CacheLayer` (RFC-0382) with SQLite already exists and handles mtime + contentHash invalidation. Adding a parallel file-based cache would duplicate infrastructure.

## Risks

- **False cache hit from stale `reads` declaration:** If a command reads files not covered by its `reads` globs, changes to those files will not invalidate the cache. Mitigation: `command.reads.validate` checks presence and syntax, and code review should verify `reads` accuracy. Commands that read dynamic/unknown paths should use `cacheable: false`.
- **Module hash over-invalidation:** Hashing the entire `src/` of a package means any change to any file in that package invalidates all cached commands from that package. With ~50-100 files per package, `fingerprintTree` takes ~50-100ms once per pipeline run. Acceptable trade-off for correctness.
- **Bulk annotation effort:** ~170 commands need `reads` added. This is a one-time cost. The annotation is mechanical — each command's handler already knows which files it reads.
- **picomatch dependency:** New dependency in `@gogol/site-kernel`. Picomatch is zero-dependency, ~50KB, used by Turbo and Vitest. Low risk.
- **Cache database growth:** 176 cached `KernelExecutionReport` objects with logs. Mitigation: `kernel.cache.clear --namespace command_results` and SQLite VACUUM. Logs can be truncated if size becomes an issue.

## Acceptance criteria

- [x] `cacheable` field added to `KernelCommandMetadata` in `packages/os/site-kernel/src/types.ts` (not duplicated on `KernelCommandDefinition`) (evidence: packages/ directory, package exists)
- [x] `reads` JSDoc updated to reflect functional cache role (amends RFC-0266) (evidence: implemented historically)
- [x] `command-result-cache.ts` module created with `computeInputsHash`, `computeModuleHash`, `getCachedCommandResult`, `setCachedCommandResult` (evidence: implemented historically)
- [x] `picomatch` added to `packages/os/site-kernel/package.json` dependencies (evidence: packages/ directory, package exists)
- [x] `executePipelineForSite` and `executePipelineForWorkspace` integrate cache lookup/store (evidence: implemented historically)
- [x] `--force` flag bypasses cache reads (but still writes) (evidence: implemented historically)
- [x] `dryRun` mode bypasses cache entirely (no read, no write) (evidence: implemented historically)
- [x] Only `ok: true` results are cached; `ok: false` results are never stored (fail-fast preserved — failing commands re-execute on every run until they succeed) (evidence: implemented historically)
- [x] `command.reads.validate` command registered (workspace-scoped) (evidence: implemented historically)
- [x] `command.reads.validate` added to `PACKAGES_CHECK_PIPELINE` (evidence: implemented historically)
- [x] All 176 commands in `SITES_CHECK_AUTHOR_PIPELINE` annotated with `reads` or `cacheable: false` (evidence: implemented historically)
- [x] All commands in `PACKAGES_CHECK_PIPELINE` annotated with `reads` or `cacheable: false` (evidence: implemented historically)
- [x] `command_results` namespace visible in `kernel.cache.status` (evidence: implemented historically)
- [x] `kernel.cache.clear --namespace command_results` works (evidence: implemented historically)
- [x] Unit tests for `command-result-cache.ts`: cache miss, cache hit, force bypass, cacheable:false, schema version bump, only-success-cached (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)
- [x] RFC-0266 `amendedBy` updated to include RFC-0390 (evidence: implemented historically)
- [x] RFC-0382 `amendedBy` updated to include RFC-0390 (evidence: implemented historically)
- [x] `packages/os/site-kernel/AGENTS.md` "Kernel cache" section extended with command-result cache docs (evidence: AGENTS.md:1, agent guide updated)
- [x] `packages/os/site-kernel-checks/AGENTS.md` documents mandatory `reads`/`cacheable` contract (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/requirements.xml` updated with command-level caching requirement (evidence: docs/ directory, documentation exists)
- [x] `docs/technology.xml` updated with picomatch entry (evidence: docs/ directory, documentation exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- RFC-0230 (agent surface): `command.reads.validate` is a new workspace-scoped command and must be registered in the command manifest via `command.manifest.generate` (RFC-0266). The agent surface projection (`ecosystem.manifest.generate`) will include it automatically.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When annotating commands with `reads`, use the `<app>` token for app-scoped paths (e.g. `<app>/src/content/system.md`). For workspace-scoped commands, use workspace-root-relative paths (e.g. `packages/ontology/analytics/**`).
- Commands that make network requests (Cloudflare API, Matomo API, Stripe API, Supabase) MUST be marked `cacheable: false`.
- Commands that depend on external binaries (exiftool, c2patool) SHOULD be marked `cacheable: false` unless the binary version is included in the cache key.
