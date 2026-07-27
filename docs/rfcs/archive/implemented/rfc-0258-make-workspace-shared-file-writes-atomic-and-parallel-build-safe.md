---
id: RFC-0258
title: "Make workspace-shared file writes atomic and parallel-build safe"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0023
  - RFC-0081
  - RFC-0087
  - RFC-0091
commands:
  proposed: []
  added:
    - workspace.write.boundary.lint
  changed:
    - uni.registry.build
    - archetype.registry.build
    - ecosystem.manifest.generate
    - maintenance.debt.queue.generate
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Two concurrent `pnpm --filter <app> build` runs never produce a torn or half-written `uni.registry.json` or `packages/ontology/archetypes/index.json`."
  - "Every kernel command that writes a file outside the target app directory does so through `writeFileAtomic` and is registered on the shared-write allowlist."
  - "`workspace.write.boundary.lint` fails when a command reachable from an APPS_* pipeline gains an undeclared workspace-root output path."
nonGoals:
  - "Do not serialize the whole Turborepo build (no `--concurrency=1`)."
  - "Do not introduce cross-process file locks; convergent atomic writes are sufficient because shared outputs are deterministic."
  - "Do not restructure turbo tasks or caching in this RFC — that is rfc-0259."
---

# RFC-0258: Make workspace-shared file writes atomic and parallel-build safe

## Context

This RFC is part A of the 2026-07-02 AEO audit series (rfc-0258 … rfc-0270). Series order: rfc-0258 → rfc-0259 → rfc-0260 → rfc-0261 → rfc-0262 → rfc-0263 → rfc-0264 → rfc-0265 → rfc-0270 → rfc-0268 → rfc-0269 → rfc-0266 → rfc-0267.

Both deployable apps run `site-kernel pipeline build.prepare` inside their `build` script. `APPS_BUILD_PREPARE_PIPELINE` (`packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`) contains two steps that write **workspace-shared** files, not app-local files:

- `archetype.registry.build` → writes `packages/ontology/archetypes/index.json`
- `uni.registry.build` → writes the repository-root `uni.registry.json` (plain `writeFile`, see `packages/os/site-kernel-checks/src/registry.ts`, the `await writeFile(outputPath, jsonOutput, "utf-8")` call)

`turbo run build` executes app builds in parallel. Nothing sequences the two writers, and `node:fs` `writeFile` is not atomic (especially on Windows/NTFS, the primary dev platform). Other workspace-root writers with the same exposure: `ecosystem.manifest.generate` (`docs/ecosystem.generated.json`), `maintenance.debt.queue.generate` (`docs/maintenance-debt.queues.generated.json`), `funnel.statechart.generate`.

## Problem

The unprotected invariant is: **a reader must never observe a partially written workspace-shared file, and concurrent writers of the same deterministic artifact must converge to identical bytes on disk.**

Failure scenario today: app A's Astro build or `uni.registry.validate` reads `uni.registry.json` while app B's `uni.registry.build` is mid-write → JSON parse error or a false "registry is stale" failure. The failure is intermittent and load-dependent — the worst possible failure class for autonomous agents, who will "fix" healthy code in response. Windows adds `EPERM`/`EBUSY` flavors when a reader holds the file handle during overwrite.

## Decision

1. `@gogol/site-kernel` gains a `writeFileAtomic(filePath, content)` helper: write to a temp file **in the same directory** (`<name>.<random>.tmp`), then `rename` over the target. Rename within one directory is atomic on POSIX and effectively atomic on NTFS; a bounded retry loop absorbs transient Windows `EPERM`.
2. Every kernel command that writes a file outside the target app directory (workspace root, `docs/`, `packages/ontology/`) MUST use `writeFileAtomic` and MUST be registered in a static `SHARED_WRITE_ALLOWLIST`.
3. A new `workspace.write.boundary.lint` command (rule ids `WS-WRITE-01`, `WS-WRITE-02`) enforces the allowlist, building on the existing `GENERATOR_OWNERSHIP_MAP` (RFC-0087).

## Architectural fit

- Extends the RFC-0087 generator invariants (single owner, content-driven, idempotent) with a fourth invariant: **parallel-safe**.
- Complements the RFC-0081 `GENERATED_MARKER` protocol — markers guard _who_ may edit; this RFC guards _how_ generators write.
- `workspace.write.boundary.lint` lives in `@gogol/site-kernel-checks` and runs in `PACKAGES_CHECK_PIPELINE`, next to `generator.ownership.lint`.
- rfc-0259 (turbo task contracts) and rfc-0267 (WorkspaceIO port) build on this primitive; implement this RFC first.

## Design

### CLI surface

```sh
pnpm exec site-kernel run workspace.write.boundary.lint
pnpm exec site-kernel run workspace.write.boundary.lint --json
```

Workspace-scoped, read-only, no flags beyond the universal set.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/fs-atomic.ts (new; re-export from package index)
export interface WriteFileAtomicOptions {
  /** Max rename retries on Windows EPERM/EBUSY. Default 5, linear 20ms backoff. */
  retries?: number;
}
export async function writeFileAtomic(
  filePath: string,
  content: string | Uint8Array,
  options?: WriteFileAtomicOptions,
): Promise<void>;

// packages/os/site-kernel-checks/src/workspace-write-boundary.ts (new)
export interface SharedWriteEntry {
  /** Kernel command name that owns the write. */
  command: string;
  /** Workspace-root-relative output path(s) it may write. */
  outputs: string[];
  /** Module path (repo-relative) that must import writeFileAtomic. */
  module: string;
}
export const SHARED_WRITE_ALLOWLIST: SharedWriteEntry[];
```

Initial allowlist entries: `uni.registry.build`, `archetype.registry.build`, `ecosystem.manifest.generate`, `maintenance.debt.queue.generate`, `funnel.statechart.generate`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/fs-atomic.ts` | New atomic-write primitive + unit tests |
| `packages/os/site-kernel-checks/src/registry.ts` | Migrate `uni.registry.build` write to `writeFileAtomic` |
| `packages/os/site-kernel-checks/src/archetype.ts` | Migrate `archetype.registry.build` write |
| Ecosystem/debt-queue/statechart generator modules | Migrate their workspace-root writes |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | New lint command |

### Output format

Standard RFC-0203 `CheckResult` with `Diagnostic[]`:

- `WS-WRITE-01` (error): a command reachable from any `APPS_*` pipeline has a `GENERATOR_OWNERSHIP_MAP` output outside `apps/<app>/` and is not in `SHARED_WRITE_ALLOWLIST`.
- `WS-WRITE-02` (error): an allowlisted module does not import `writeFileAtomic` from `@gogol/site-kernel` (static source scan), or calls `writeFile`/`writeFileSync` on an allowlisted output path.

Each diagnostic carries the module file locator and a `fixHint` naming the allowlist file and the helper.

### Failure modes

Exit 1 on any error diagnostic. No warn-only mode: a torn shared write is always a defect. `--json` emits the canonical CheckResult; pretty output uses the central failure printer.

## Rollout

1. Land `writeFileAtomic` with unit tests (tests first — see Acceptance criteria).
2. Migrate the five known workspace-root writers in the same change.
3. Register `workspace.write.boundary.lint` in `PACKAGES_CHECK_PIPELINE` fail-hard from day one — the migration in step 2 makes the tree green before the gate lands.
4. New shared writers must add an allowlist entry; the lint message tells the agent exactly where.

## Alternatives considered

- **Cross-process lock files** (`proper-lockfile`): rejected — stale-lock recovery is its own failure class, and Windows lock semantics are unreliable. Convergent atomic writes need no mutual exclusion because outputs are deterministic (RFC-0087).
- **`turbo run build --concurrency=1`**: rejected — punishes every build to mask a fixable defect.
- **Moving all shared generation out of per-app pipelines**: partially adopted later by rfc-0259 (root turbo task). Standalone `pnpm --filter <app> build` still needs safe in-pipeline writes, so this primitive is required regardless.

## Risks

- Windows `rename` over a file opened by a reader can throw `EPERM`; the bounded retry loop mitigates. If retries are exhausted the command fails loudly (never falls back to non-atomic write).
- Static import scan in `WS-WRITE-02` is heuristic; false negatives possible if a module aliases fs functions. Acceptable — the allowlist plus review of new entries is the primary control.
- Temp-file leakage on crash: helper unlinks the temp file in a `finally`; leftover `*.tmp` files are additionally cleaned on the next run of the same writer.

## Acceptance criteria

- [x] `writeFileAtomic` exists in `@gogol/site-kernel`, exported from the package index, with unit tests written BEFORE the migration: (a) content lands intact; (b) a reader polling the target during 200 sequential writes never observes a partial file; (c) temp file removed on simulated write failure; (d) Windows-style `EPERM` on first rename attempt is retried. (evidence: packages/ directory, package exists)
- [x] Concurrency test: two parallel `executeKernelCommand("uni.registry.build")` invocations against a fixture workspace both exit 0 and the final `uni.registry.json` parses and matches the expected content hash. (evidence: implemented historically)
- [x] All five known workspace-root writers migrated to `writeFileAtomic`. (evidence: implemented historically)
- [x] `workspace.write.boundary.lint` registered (workspace scope) in `PACKAGES_CHECK_PIPELINE`, with fixture tests: undeclared shared write → `WS-WRITE-01`; allowlisted module without atomic import → `WS-WRITE-02`; clean fixture → pass. (evidence: implemented historically)
- [x] `WS-WRITE-01`/`WS-WRITE-02` registered in the RFC-0203 rule-id registry with `fixHint`s. (evidence: implemented historically)
- [x] `--json` output format documented and stable. (evidence: implemented historically)
- [x] `AGENTS.md` "Generated-file governance protocol" section gains one paragraph: shared-file writers must be atomic and allowlisted. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Implement in this order: helper + tests → writer migration → lint. Do not enable the lint before the migration lands.
- Do NOT add new write sites outside app directories while implementing; if a command needs a new shared output, add the allowlist entry in the same commit.
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` once every acceptance criterion is satisfied and checked, validators/build pass, and the change is committed referencing this RFC (RFC-0224). No other status transitions.
- When implementing, reference `rfc-0258` in commit messages.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
