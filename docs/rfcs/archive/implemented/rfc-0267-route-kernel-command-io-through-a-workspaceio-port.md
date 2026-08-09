---
id: RFC-0267
title: "Route kernel command IO through a WorkspaceIO port"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-03
implementedAt: 2026-07-03
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0326
related:
  - RFC-0141
commands:
  proposed:
    - kernel.io.lint
  added:
    - kernel.io.lint
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "New kernel commands perform filesystem access exclusively through context.io; direct node:fs imports in new command modules fail kernel.io.lint."
  - "Any command can run with --dry-run and report intended writes without touching disk."
  - "Commands declaring mutatesState: false provably cannot write: the test harness runs them under a throwing IO adapter."
nonGoals:
  - "Do not migrate all existing command modules in one change; adoption is ratcheted, new-code-first."
  - "Do not abstract network access in this RFC; WorkspaceIO covers filesystem and process execution only."
  - "Do not build remote/sandboxed execution — this RFC only creates the seam that would make it possible."
---

# RFC-0267: Route kernel command IO through a WorkspaceIO port

## Context

Part B of the 2026-07-02 AEO audit series (typed kernel boundaries; see rfc-0258 for series order). Depends on rfc-0258 (`writeFileAtomic` becomes the port's default write behavior) and pairs with rfc-0266 (declared `writes` become enforceable).

Kernel commands today reach for ambient `node:fs` directly. Consequences: `mutatesState`/`requiresNetwork` metadata is unverifiable self-description; `--dry-run` must be reimplemented per command (most don't); tests need real temp directories; and the `reads`/`writes` declarations of rfc-0266 are documentation, not a boundary. The workspace already validated the port-and-adapter cure on content: RFC-0141's `ContentSourceProvider` made the filesystem a replaceable adapter behind a named seam.

## Problem

The unprotected invariant is: **what a command may touch must be a checkable property of the command, not a hope.** An autonomous agent deciding whether a command is safe to run reads `mutatesState` — which nothing enforces. An agent wanting a preview of effects has no uniform dry-run. An agent writing tests pays tmpdir plumbing for every check.

## Decision

1. `@gogol/site-kernel` gains a `WorkspaceIO` interface; `KernelRuntimeContext` gains `io: WorkspaceIO`.
2. The default adapter wraps `node:fs/promises` with `writeFileAtomic` (rfc-0258) as the only write primitive.
3. The executor provides two derived adapters: a **recording** adapter (used by a new universal `--dry-run`: intercepts writes/deletes, records intents, touches nothing) and a **read-only** adapter that throws `KERNEL-META-01` on any write (used by the test harness for every command with `mutatesState: false`, and by the executor itself when such a command runs).
4. A new `kernel.io.lint` (rule `IO-01`) forbids direct `node:fs` / `node:fs/promises` imports in command-implementing modules, ratcheted by a shrink-only baseline of current offenders; new command modules comply from day one.

## Architectural fit

- Same seam philosophy as RFC-0141, applied to the kernel: the filesystem becomes an injected capability.
- Completes the chain rfc-0258 → rfc-0266 → rfc-0267: atomic primitive → declared IO → enforced IO. After this RFC, `command.manifest.validate` can gain a runtime-observation mode (out of scope here) comparing actual IO against declared `writes`.
- `KERNEL-META-01` finally makes `mutatesState` trustworthy — the metadata agents use to pick safe commands.

## Design

### CLI surface

```sh
# Universal dry-run once a command's module is migrated:
pnpm exec werkstatt run sitemap.generate --app warpgogol-com --dry-run
# → reports: would write public/sitemap.xml (4.2 KB); no files touched
pnpm exec werkstatt run kernel.io.lint --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/workspace-io.ts (new)
export interface WorkspaceIO {
  readFile(path: string): Promise<string>;
  readFileBytes(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  glob(pattern: string, opts?: { cwd?: string }): Promise<string[]>;
  /** Atomic by contract (rfc-0258). */
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  rm(path: string, opts?: { recursive?: boolean }): Promise<void>;
  exec(command: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;
}

export interface WriteIntent { kind: "write" | "mkdir" | "rm"; path: string; bytes?: number; }
export function createRecordingIO(base: WorkspaceIO): { io: WorkspaceIO; intents: WriteIntent[] };
export function createReadOnlyIO(base: WorkspaceIO, commandName: string): WorkspaceIO; // throws KERNEL-META-01 on mutation

// packages/os/site-kernel/src/types.ts
export interface KernelRuntimeContext {
  // …existing fields…
  io: WorkspaceIO;
}
```

Executor behavior: `mutatesState: false` → command always receives the read-only adapter; `--dry-run` on a migrated command → recording adapter, intents printed in the result summary and `--json` data.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/workspace-io.ts` | Port + adapters + tests |
| `packages/os/site-kernel/src/runtime.ts` | Context wiring, adapter selection |
| `packages/os/site-kernel-checks/src/kernel-io-lint.ts` | IO-01 lint + baseline |
| `packages/os/site-kernel-checks/src/kernel-io-lint.baseline.generated.json` | Shrink-only offender baseline |

### Output format

`kernel.io.lint`: standard `CheckResult`, `IO-01` diagnostics with file locators and the fixHint "receive io from KernelRuntimeContext instead of importing node:fs". Dry-run intents in `--json`: `data.writeIntents: WriteIntent[]`.

### Failure modes

`KERNEL-META-01` aborts the command with the attempted path and the instruction to either fix the command or (if the write is legitimate) change `mutatesState` to `true` AND declare the path in `writes` (rfc-0266). Lint exits 1 on baseline growth.

## Rollout

1. Land port + adapters + executor wiring + tests. Ambient-fs commands keep working (they ignore `context.io`); zero flag-day.
2. Enable read-only enforcement for `mutatesState: false` commands — but ONLY for commands whose modules are baseline-free (migrated), expanding as the baseline shrinks; enforcing on unmigrated modules would not intercept their ambient fs anyway.
3. Land `kernel.io.lint` with the generated baseline; new command modules must be clean.
4. Register a maintenance-debt queue (RFC-0256 machinery, `id: kernel-io-migration`) for the burn-down, prioritizing generator commands (they gain `--dry-run` value first).

## Alternatives considered

- **Monkey-patching `node:fs` in the executor for enforcement**: rejected — global patching is fragile across ESM boundaries and punishes non-command code sharing the process.
- **OS-level sandboxing (worker threads with restricted fs)**: rejected for now — heavy, platform-specific on Windows; the port gives 90% of the value and is a prerequisite for real sandboxing later anyway.
- **Skipping the port and only declaring IO (rfc-0266 alone)**: rejected — declarations without enforcement rot into documentation.

## Risks

- Largest migration surface in the series (most of ~150 check modules import fs). Contained by: baseline ratchet, queue-driven batches, and the fact that reads-only checks migrate trivially (readFile/glob swap).
- `exec` wrapping may miss exotic child-process usage; IO-01 also flags `node:child_process` imports in command modules.
- Double-abstraction risk for codegen helpers like `writeManagedFile`: resolve by re-basing `writeManagedFile` ON the port (it takes `io` as its first argument after migration), not beside it.

## Acceptance criteria

- [x] Port + adapter tests written BEFORE wiring: recording adapter captures intents and touches nothing (fs spy); read-only adapter throws `KERNEL-META-01` naming command and path; default adapter writes atomically (delegates to rfc-0258 helper). (evidence: implemented historically)
- [x] `context.io` available to every command; executor selects adapters per the rules above. (evidence: implemented historically)
- [x] Universal `--dry-run` works end-to-end on `robots.generate` and `ai.generate` (migrated as pilots, in place of `sitemap.generate` — see As-built), reporting intents in `--json`. (evidence: implemented historically)
- [x] `kernel.io.lint` + baseline registered in `PACKAGES_CHECK_PIPELINE`; red/green fixtures (satisfies rfc-0261). (evidence: implemented historically)
- [x] Test harness runs every `mutatesState: false` command under read-only IO in the migrated set; at least one previously mislabeled command found-or-proven-absent (report in PR — see As-built). (evidence: implemented historically)
- [x] `kernel-io-migration` debt queue registered. (evidence: implemented historically)
- [x] Rule ids registered with fixHints; `packages/os/site-kernel-checks/docs/check-module-guide.md` updated with the io-first pattern. (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## As-built

- **Port + adapters** (`packages/os/site-kernel/src/workspace-io.ts`): `WorkspaceIO` interface exactly as designed (`readFile`/`readFileBytes`/`exists`/`glob`/`writeFile`/`mkdir`/`rm`/`exec`), `createDefaultIO()` (writes via `writeFileAtomic`, rfc-0258), `createRecordingIO(base)`, `createReadOnlyIO(base, commandName)` throwing `KernelMetaError`/`KERNEL-META-01`. 7 unit tests (`tests/workspace-io.test.ts`) cover all three adapters, written before the executor was wired.
- **Executor wiring** (`runtime.ts`): `KernelRuntimeContext.io` is a required field (all context-construction call sites updated). `executeRegisteredCommand` picks the adapter: `mutatesState === false` → always read-only; else `context.dryRun` → recording (intents surfaced as `result.data.writeIntents`); else → default. No cross-package split was needed for the port itself (unlike CMD-MAN-03 in rfc-0266) — both pipeline drivers (`executePipelineForApp`/`executePipelineForWorkspace` in site-kernel, `runCommandSequence` in site-kernel-checks) ultimately call the same `executeKernelCommand`/`executeRegisteredCommand`, so adapter selection is centralized in one place.
- **Mislabeled-command proof**: no real command in the current repo was found mislabeled — a synthetic fixture pair (`fixture.mislabeled.command` / `fixture.honest.readonly.command`) proves the enforcement end-to-end (`tests/workspace-io-executor.test.ts`, 2 tests): the mislabeled fixture declares `mutatesState: false` but calls `context.io.writeFile` and is asserted to fail with `KERNEL-META-01`; the honest fixture is asserted to succeed under the read-only adapter. This satisfies the criterion's "or-proven-absent" branch.
- **Pilot migrations**: `robots.generate`, `ai.generate`, and (in the follow-up) `sitemap.generate`. `robots.ts`/`ai.ts` had a single hand-rolled `if (!context.dryRun) {...}` guard around straightforward `readFile`/`mkdir`/`writeFile` calls — mechanical swaps done first. `sitemap.generate` was initially deferred because its generate path calls `node:fs/promises` `readdir` (people-directory listing) which the port lacked; the follow-up **completed the port** with `readdir(path): Promise<DirEntry[]>` (a read op; `DirEntry` = `{name, isFile, isDirectory}` keeps `node:fs` `Dirent` out of command modules), then migrated `sitemap.ts` fully — both `runSitemapGenerate` and `runSitemapValidate` now take IO from `context.io`, the module no longer imports `node:fs` at all, and it dropped out of the IO-01 baseline (163 → 162). Parity verified: real `sitemap.generate` is byte-identical to the committed output and `sitemap.validate` still passes. This is the concrete proof that the port is now complete enough for directory-listing commands to migrate mechanically.
- **`kernel.io.lint` (IO-01)**: shrink-only baseline across `packages/os/site-kernel-checks/src` (`kernel-io-lint.baseline.generated.json`), registered in `PACKAGES_CHECK_PIPELINE` right after `kernel.flags.lint`. 163 files at landing, ratcheted down to 162 by the `sitemap.ts` migration. Fixture tests cover both the pure `findForbiddenIoImports` scanner (red: `node:fs/promises`, red: `node:child_process`, green: `context.io`-only module, green: `node:path` is not forbidden) and the command-level `runKernelIoLint` (red: unbaselined `node:fs/promises` importer → exitCode 1 / IO-01; green: `context.io`-only module → exitCode 0) so `check.fixture.lint` sees a real red+green pair.
- **`kernel-io-migration` maintenance-debt queue**: registered `status: paused`, same structural reason as `diagnostic-shim-migration.yaml` — IO-01 is workspace-scoped error-severity debt gated directly by `kernel.io.lint`, with no matching entries in the `ADVISORY_APP_COMMANDS` item pool that `maintenance.debt.queue.validate`'s MDQ-04 rule checks for active queues.
- **Docs**: `packages/os/site-kernel-checks/docs/check-module-guide.md` gained an "io-first pattern" section with a minimal command-module shape and a migration checklist, referencing `robots.generate`/`ai.generate` as the worked example.
- Full verification: typecheck clean for `@gogol/site-kernel` and `@gogol/site-kernel-checks`; site-kernel's full test suite 88/88 green (includes the new workspace-io + executor tests); site-kernel-checks' suite green including `kernel-io-lint.test.ts`; `rfc.validate` 256/256; `docs.commands.generate`/`command.manifest.generate`/`ecosystem.manifest.generate` regenerated to include `kernel.io.lint`.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Implement AFTER rfc-0258 and rfc-0266 are implemented; the port's write path and the declared-IO reconciliation depend on them.
- When migrating a module, swap fs calls mechanically; do NOT refactor its logic in the same commit (keeps diffs reviewable and parity obvious).
- Never bypass the read-only adapter by caching an fs reference at module top-level — the lint exists to catch exactly this; if you hit it, migrate properly.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0267` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
