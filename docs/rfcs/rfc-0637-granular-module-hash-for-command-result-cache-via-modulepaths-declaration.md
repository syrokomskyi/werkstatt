---
id: RFC-0637
title: "Granular module hash for command-result cache via modulePaths declaration"
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
createdAt: 2026-08-01
updatedAt: 2026-08-01
enhancedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-53
  - RFC-0390
  - RFC-0619
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
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
  - packages/os/site-kernel
successSignals:
  - Cache hit rate improves for commands whose source files haven't changed
  - Changing one command's source no longer invalidates all other commands' caches
  - Commands without modulePaths fall back to full src/ hash (backward compatible)
nonGoals:
  - Static import-graph analysis for transitive dependency hashing
  - Changing the command-result cache key structure (RFC-0390)
  - Caching astro build or execSync-based commands
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

# RFC-0637: Granular module hash for command-result cache via modulePaths declaration

## Context

The command-result cache (RFC-0390) caches individual pipeline step results in a SQLite database (`.cache/kernel-cache.db`). Each cache entry is keyed by `schemaVersion + commandName + siteName + inputsHash + moduleHash`.

`computeModuleHash` (in `packages/os/site-kernel/src/cache/command-result-cache.ts`) fingerprints the entire `packages/os/site-kernel-checks/src/` directory (excluding `__tests__`, `node_modules`, `dist`). This directory contains 200+ source files across 30+ subdirectories. Any change to any file in this directory invalidates the `moduleHash` for **every** command, causing a full cache miss across all commands in the next pipeline run.

The `moduleHash` is cached per-package per-pipeline-run in a `Map<string, string>` to avoid re-hashing the same directory for every command. However, the granularity is still per-package — one hash for all commands in `site-kernel-checks`.

## Problem

A single-line change to one command's source file (e.g., fixing a typo in `image-variants.ts`) invalidates the `moduleHash` for all 200+ commands registered in `site-kernel-checks`. The next pipeline run re-executes every command, even those whose source code hasn't changed. This defeats the purpose of the command-result cache during iterative development — any platform change causes a full cache flush.

## Decision

`KernelCommandDefinition` gains an optional `modulePaths?: string[]` field. When present, `computeModuleHash` fingerprints only the listed paths (files and/or directories, relative to the module's `src/` directory) instead of the entire `src/` directory. When absent, the existing behavior (full `src/` fingerprint) is preserved as a backward-compatible fallback.

Commands are migrated incrementally — each command declares its `modulePaths` when ready, and unmigrated commands continue to use the full-directory hash.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** All hashing uses `@warpgogol/fingerprint`. `computeModuleHash` already uses `fingerprintTree` from this package. The granular hash continues to use the same fingerprint primitives — only the scope of files fingerprinted changes.
- **RFC-0390 (command-result cache):** This RFC refines the `moduleHash` component of the cache key. The cache key structure (`schemaVersion + commandName + siteName + inputsHash + moduleHash`) is unchanged. The `moduleHashCache` Map in `execute-pipeline.ts` is keyed by the `modulePaths` array (joined) instead of just the module source directory, so commands with different `modulePaths` get independent cache entries.
- **RFC-0619 (bypass cache during materialization):** Unrelated. The cache bypass during materialization prevents stale entries from a different platform version. Granular module hashing improves cache hit rate but doesn't change the bypass logic.
- **`command.reads.validate` (CRC-01/CRC-02):** Unchanged. Commands must still declare `reads` or `cacheable: false`. `modulePaths` is an additional declaration that controls cache granularity, not a replacement for `reads`.

## Design

### CLI surface

No new CLI commands. This is an internal change to the command-result cache logic. Operators interact with the cache via existing commands:

```sh
# Check cache status (unchanged)
pnpm exec site-kernel run kernel.cache.status --json

# Clear cache (unchanged)
pnpm exec site-kernel run kernel.cache.clear

# Force cache refresh for a pipeline run (unchanged)
pnpm exec site-kernel run mission.validate --site warpgogol-com --force
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts — addition to KernelCommandDefinition
export interface KernelCommandDefinition<TData = unknown> extends KernelCommandMetadata {
  // ... existing fields ...
  reads?: string[];
  writes?: string[];
  /**
   * RFC-0637: paths (files and/or directories) relative to the module's src/
   * directory that this command's execute() depends on. When present,
   * computeModuleHash fingerprints only these paths instead of the full src/.
   * When absent, the full src/ directory is fingerprinted (backward compatible).
   * Paths use POSIX forward slashes. Directories are fingerprinted recursively.
   */
  modulePaths?: string[];
  execute(
    input: KernelCommandInput,
    context: KernelRuntimeContext,
  ): Promise<void | KernelCommandResult<TData>> | void | KernelCommandResult<TData>;
}
```

```ts
// packages/os/site-kernel/src/cache/command-result-cache.ts — updated signature
export async function computeModuleHash(
  moduleSrcDir: string,
  modulePaths?: string[],
): Promise<string> {
  if (modulePaths && modulePaths.length > 0) {
    // Fingerprint only the listed paths (files + directories)
    const hashes: string[] = [];
    for (const p of modulePaths) {
      const abs = join(moduleSrcDir, p);
      if (existsSync(abs)) {
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) {
          const result = await fingerprintTree(abs, {
            mode: "semantic",
            ignore: ["__tests__", "node_modules", "dist"],
          });
          hashes.push(`${p}:${result.value}`);
        } else {
          const result = await fingerprintFile(abs, { mode: "semantic" });
          hashes.push(`${p}:${result.hash}`);
        }
      }
    }
    return stableJsonHash({ paths: hashes });
  }
  // Fallback: fingerprint entire src/ directory (existing behavior)
  try {
    const result = await fingerprintTree(moduleSrcDir, {
      mode: "semantic",
      ignore: ["__tests__", "node_modules", "dist"],
    });
    return result.value;
  } catch {
    return byteHash(`module-hash-fallback:${moduleSrcDir}`);
  }
}
```

```ts
// packages/os/site-kernel/src/runtime/execute-pipeline.ts — cache key change
// Before: moduleHashCache keyed by moduleSrcDir
// After: moduleHashCache keyed by `${moduleSrcDir}:${modulePaths?.join(",") ?? ""}`
const cacheKey = `${moduleSrcDir}:${command.modulePaths?.join(",") ?? ""}`;
let moduleHash = moduleHashCache.get(cacheKey);
if (!moduleHash) {
  moduleHash = await computeModuleHash(moduleSrcDir, command.modulePaths);
  moduleHashCache.set(cacheKey, moduleHash);
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | `KernelCommandDefinition` interface — add `modulePaths` field |
| `packages/os/site-kernel/src/cache/command-result-cache.ts` | `computeModuleHash` — add `modulePaths` parameter |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | `moduleHashCache` key — include `modulePaths` (both `tryCacheRead` and `tryCacheWrite` in both `executePipelineForSite` and `executePipelineForWorkspace`) |
| `packages/os/site-kernel/AGENTS.md` | Update "Command-result cache (RFC-0390)" section to document `modulePaths` parameter and cache key change |
| `packages/os/site-kernel-checks/src/command-tables/*.ts` | Commands declare `modulePaths` during incremental migration (Phase 2, not part of this RFC's acceptance criteria) |

### Output format

No output format changes. The command-result cache operates internally. The `kernel.cache.status` command output is unchanged — it reports cache entries and hit/miss counts, not the module hash granularity.

### Failure modes

- **`modulePaths` references non-existent path:** The path is silently skipped (no hash contribution). This is safe — a missing path means the command doesn't depend on it, so excluding it from the hash is correct.
- **`modulePaths` is empty array:** Treated as absent — falls back to full `src/` fingerprint.
- **`modulePaths` omits a transitive dependency:** The command may get a false cache hit if the omitted dependency changes. This is the primary risk — see Risks section. Mitigated by conservative initial migration: only commands with clear, self-contained source directories are migrated first.
- **`modulePaths` includes a directory:** The directory is fingerprinted recursively (excluding `__tests__`, `node_modules`, `dist`), same as the current full-directory behavior but scoped to the subdirectory.

## Rollout

- **Default behavior:** `modulePaths` is optional. Commands without `modulePaths` use the existing full-`src/` fingerprint. No flag day.
- **Phase 1 (platform change):** Add `modulePaths` to `KernelCommandDefinition`, update `computeModuleHash` and `execute-pipeline.ts`. No command declarations change yet — all commands still use the full-`src/` hash.
- **Phase 2 (incremental migration):** Commands with clear, self-contained source directories declare `modulePaths` first (e.g., `image.variants.generate` → `["image-variants.ts", "lib/"]`, `bordbuch.generate` → `["bordbuch/"]`). Commands with complex cross-directory dependencies are migrated later or left on the full-`src/` fallback.
- **Phase 3 (validation):** `command.reads.validate` is extended to warn if a command declares `modulePaths` but the paths don't exist on disk.
- **No deprecation:** The full-`src/` fallback is permanent — some commands may always have too many cross-directory dependencies to migrate.

## Alternatives considered

- **Transitive import-graph analysis:** Hash the command's source file plus all files it transitively imports within the package. Rejected because it requires static import analysis (parsing import statements, resolving specifiers, following re-exports), which is complex, fragile, and adds a significant dependency. The `modulePaths` declaration is simpler, explicit, and auditable.

- **Hash only the command's source file (no transitive imports):** Rejected because `execute()` typically imports helpers from other files. If those helpers change but the command file doesn't, the cache would return a stale result. This is a false cache hit — the worst possible failure mode for a cache.

- **Hash per subdirectory (e.g., `command-tables/`, `validators/`, `lib/`):** Rejected because commands import across subdirectories (e.g., a command in `command-tables/09-build-artifacts.ts` imports from `../image-variants.ts` and `../lib/`). Subdirectory-level hashing would still invalidate many commands when a shared directory like `lib/` changes, and wouldn't capture top-level file dependencies.

## Risks

- **False cache hits from incomplete `modulePaths`:** If a command declares `modulePaths` that omit a file it transitively depends on, a change to that file won't invalidate the cache. The command would execute against stale code. Mitigated by: (1) conservative initial migration — only self-contained commands are migrated first; (2) `--force` flag bypasses the cache entirely; (3) the full-`src/` fallback is always safe.
- **Maintenance burden:** Each command's `modulePaths` must be kept in sync with its actual import dependencies. If a command starts importing a new helper, `modulePaths` must be updated. Mitigated by `command.reads.validate` Phase 3 validation (warn on missing paths).
- **Agent confusion:** Agents adding new commands may not know to declare `modulePaths`. This is acceptable — new commands without `modulePaths` use the safe full-`src/` fallback. Agents migrating existing commands MUST audit the command's imports before declaring `modulePaths`.
- **Hash computation overhead:** Fingerprinting multiple small paths instead of one large directory may be slightly slower due to multiple I/O calls. Mitigated by the `moduleHashCache` Map — the hash is computed once per `modulePaths` combination per pipeline run.

## Acceptance criteria

- [ ] `KernelCommandDefinition` has optional `modulePaths?: string[]` field
- [ ] `computeModuleHash` accepts optional `modulePaths` parameter and fingerprints only listed paths when present
- [ ] `execute-pipeline.ts` `moduleHashCache` key includes `modulePaths` value
- [ ] Commands without `modulePaths` fall back to full `src/` fingerprint (backward compatible)
- [ ] Unit test: `computeModuleHash` with `modulePaths` hashes only listed paths
- [ ] Unit test: `computeModuleHash` without `modulePaths` hashes full `src/` (existing behavior)
- [ ] Unit test: `moduleHashCache` keys are distinct for different `modulePaths` values
- [ ] Unit test: non-existent path in `modulePaths` is silently skipped
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- When migrating a command to use `modulePaths`, agents MUST audit the command's import statements and include all files/directories that the command's `execute()` transitively depends on within the package. External package dependencies are covered by `platformSemanticHash` and do not need to be in `modulePaths`.
- Agents MUST NOT declare `modulePaths` for a command without verifying that all transitive intra-package imports are covered. An incomplete `modulePaths` declaration can cause false cache hits.
- New commands MAY omit `modulePaths` — the full-`src/` fallback is always safe.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
