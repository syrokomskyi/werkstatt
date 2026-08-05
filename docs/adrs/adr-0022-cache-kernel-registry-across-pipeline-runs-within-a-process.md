---
id: ADR-0022
title: "Cache kernel registry across pipeline runs within a process"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-04
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0390
  - RFC-0685
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0022: Cache kernel registry across pipeline runs within a process

## Context

The kernel registry (`KernelRegistry`) is built by loading all command modules from `packages/os/site-kernel-checks/src/` and `packages/forge/os/*/` via `tsImport`. This happens every time `executeKernelPipeline` is called. When the orchestrator runs `build.prepare`, `build.check`, and `build.post` sequentially for the same site, the registry is built three times — each taking ~200–400ms due to dynamic TypeScript module loading and icon resolution. The registry is also rebuilt for each site in `--all` mode, multiplying the cost by the number of sites.

The registry is immutable within a process: command modules are not hot-reloaded. Once loaded, the command definitions, flag schemas, and module icons do not change. The `tools/kernel.config.ts` configuration is also static.

## Decision

The kernel registry is cached at the module level in `packages/os/site-kernel/src/` with a process-lifetime singleton, built once on first access and reused across all subsequent `executeKernelPipeline` and `executeKernelCommand` calls within the same Node.js process.

- The cache is invalidated only by process exit or explicit `--no-registry-cache` flag (for debugging).
- The cache does not persist across processes — each new `site-kernel run` invocation builds the registry fresh.
- The `--all` mode benefits most: N sites × 3 pipelines = 3N registry builds become 1.

## Justification

The registry build is pure overhead when the same process runs multiple pipelines. In the `--all` mode with 5 sites, the current behavior builds the registry 15 times (5 sites × 3 pipelines). With a process-level singleton, it builds once. At ~300ms per build, this saves ~4.2s of wall time.

Alternatives considered:

- **Persistent cross-process cache** (e.g. SQLite-backed): rejected because `tsImport` loads TypeScript source files that may change between runs. A cross-process cache would need invalidation logic (mtime checks on all source files), adding complexity for marginal benefit — the first build per process is fast enough.
- **Lazy module loading**: only load command modules when their command is actually invoked. Rejected because the registry needs all command definitions for flag validation, pipeline step resolution, and the `command.manifest.generate` command. Lazy loading would complicate the registry API and break existing consumers.
- **No caching**: the current behavior. Rejected because the registry is immutable within a process and rebuilding it is pure waste.

## Consequences

- **Positive**: Pipeline wall time drops by ~300ms per pipeline run after the first (registry build amortized). In `--all` mode with N sites, saves ~(3N-1) × 300ms.
- **Positive**: The `command.manifest.generate` and `rfc.list` commands, which also need the registry, benefit from the same cache.
- **Negative**: If a command module is modified during a long-running process (e.g. a watch mode), the change is not picked up until the process restarts. This is already the case — `tsImport` caches modules — but the registry singleton makes it explicit.
- **Technical debt**: The `--no-registry-cache` flag is a debugging escape hatch. If it sees frequent use, it signals that the cache invalidation strategy is too aggressive and a more granular approach is needed.

## Evolution

If a watch mode or persistent daemon is introduced (currently not planned), the registry cache would need invalidation on source file changes. At that point, a file-watcher-based invalidation strategy would replace the process-lifetime singleton.

If the number of command modules grows significantly (>100), lazy module loading may become necessary to avoid loading unused commands. The singleton cache would be replaced with a lazy-loading proxy that loads modules on first access.
