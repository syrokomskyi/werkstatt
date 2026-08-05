---
id: ADR-0024
title: "Adopt modulePaths on top kernel commands for granular module hashing"
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
  - RFC-0637
  - RFC-0390
  - RFC-0685
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0024: Adopt modulePaths on top kernel commands for granular module hashing

## Context

RFC-0637 introduced the `modulePaths` field on `KernelCommandDefinition`: when present, `computeModuleHash` fingerprints only the listed paths instead of the entire `src/` directory of the command's module. This is significantly faster for modules with many files where a command only depends on a few.

Currently, most commands in `packages/os/site-kernel-checks/src/` do not declare `modulePaths`. When `modulePaths` is absent, `computeModuleHash` in `command-result-cache.ts:145–177` fingerprints the entire `site-kernel-checks/src/` directory — hundreds of files — via `fingerprintTree` in semantic mode. This happens on every cache check for every cacheable command.

The `site-kernel-checks/src/` directory contains command modules, pipeline definitions, validators, generators, and utility files. A command like `security.txt.generate` depends on only 2–3 files in that directory, but its module hash includes all ~200 files. Any change to any file in `src/` invalidates the module hash for all commands without `modulePaths`, even if the change is unrelated.

## Decision

The top 50 most frequently executed kernel commands in `packages/os/site-kernel-checks/src/` are audited and annotated with `modulePaths` declarations, listing the specific files and directories each command's `execute()` function depends on.

- Priority: commands in `build.prepare` (most frequently executed), then `build.check`, then `build.post`.
- The audit identifies dependencies by tracing imports from each command's `execute()` function.
- Commands that depend on the entire module (e.g. pipeline orchestrators) are left without `modulePaths` — the full `src/` hash is correct for them.
- A `modulePaths.coverage` metric is added to the pipeline report showing the percentage of cacheable commands with `modulePaths` declared.

## Justification

Without `modulePaths`, any change to any file in `site-kernel-checks/src/` invalidates the module hash for all ~40 cacheable commands. This means a one-line change to a validator causes all generators to miss the cache on the next run, even though the generators don't depend on the validator.

With `modulePaths`, a change to `security.txt.ts` only invalidates the module hash for `security.txt.generate` — all other commands retain their cache hits. This makes incremental development significantly faster: editing one command's source only forces that command to re-execute.

The `computeModuleHash` function with `modulePaths` fingerprints 2–5 files instead of ~200. At ~1ms per file (semantic mode), this reduces module hash time from ~200ms to ~5ms per command. Across 40 commands, this saves ~7.8s per pipeline run.

Alternatives considered:

- **Automatic dependency tracing**: use TypeScript's module resolution to automatically determine `modulePaths` from import graphs. Rejected because it requires a TypeScript language service at runtime, which is heavy and fragile. Manual declaration with audit is simpler and more predictable.
- **Per-command `src/` subdirectories**: reorganize `site-kernel-checks/src/` so each command has its own subdirectory, and `computeModuleHash` fingerprints only that subdirectory. Rejected because it would require a large file reorganization and many commands share utility files across subdirectories.
- **No `modulePaths` adoption**: rely on RFC-0685's mtime fast path to skip fingerprinting when files are unchanged. Rejected because the mtime fast path still needs to compare all ~200 files' metadata. With `modulePaths`, only 2–5 files' metadata is compared, which is faster even with the mtime fast path.

## Consequences

- **Positive**: Module hash computation drops from ~200ms to ~5ms per command with `modulePaths`. Across 40 cacheable commands, saves ~7.8s per pipeline run.
- **Positive**: Incremental development is faster — editing one command's source only invalidates that command's cache, not all commands'.
- **Positive**: The `modulePaths.coverage` metric makes adoption progress visible and auditable.
- **Negative**: Each `modulePaths` declaration must be kept in sync with the command's actual dependencies. If a command starts importing a new utility file and `modulePaths` is not updated, the module hash won't change when the utility file changes, causing a stale cache hit. Mitigation: the `reads[]` hash check (RFC-0390) covers input files, and the `modulePaths` audit is repeated periodically.
- **Negative**: The initial audit of 50 commands is labor-intensive — each command's import tree must be traced manually or with tooling assistance.
- **Technical debt**: Commands without `modulePaths` still pay the full `src/` hash cost. The coverage metric tracks this debt. The goal is >80% coverage of cacheable commands.

## Evolution

If an automated import-tracing tool becomes available (e.g. a `modulePaths.suggest` command that uses TypeScript's module resolver to suggest `modulePaths` for a command), the manual audit process would be replaced with automated suggestions reviewed by a human.

If the `site-kernel-checks/src/` directory grows beyond ~500 files, the full-directory hash for commands without `modulePaths` becomes prohibitively expensive. At that point, `modulePaths` may become mandatory for all cacheable commands, enforced by a `modulePaths.required` validation rule.
