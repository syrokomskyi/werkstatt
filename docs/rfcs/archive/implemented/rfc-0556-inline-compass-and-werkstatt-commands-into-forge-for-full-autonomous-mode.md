---
id: RFC-0556
title: "Inline compass and werkstatt commands into forge for full autonomous mode"
status: implemented
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0374
amendedBy: []
related:
  - RFC-0374
  - RFC-0348
  - RFC-0352
  - RFC-0362
  - RFC-0391
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-42
  - DNA-43
  - DNA-51
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - compass.inventory
    - compass.validate
    - compass.summary.trim
    - compass.changesummary.validate
    - compass.audit.plan
    - compass.audit.record
    - compass.audit.baseline
    - compass.audit.validate
    - werkstatt.lock.status
    - werkstatt.lock.recover
    - werkstatt.operation.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
  - site-kernel-checks
  - site-kernel-handoff
successSignals:
  - All 11 compass and werkstatt commands register and execute in a project with only @warpgogol/forge installed (no @warpgogol/* packages)
  - forge bin/cli.ts no longer uses .catch(() => null) for compass and werkstatt module imports
  - site-kernel-checks and site-kernel-handoff delegate compass/werkstatt command execution to forge-inlined implementations
nonGoals:
  - Creating a separate @warpgogol/compass-core npm package — all logic inlines directly into forge os/ modules
  - Removing site-kernel-checks or site-kernel-handoff packages — they remain as thin delegation wrappers in werkstatt
  - Changing the compass or werkstatt command names, flags, or --json output shapes
  - Adding integrity-registry support to forge-inlined audit commands — git-history-only is sufficient for autonomous mode
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

# RFC-0556: Inline compass and werkstatt commands into forge for full autonomous mode

## Context

`@warpgogol/forge` is a portable governance toolkit published to npm. When installed in an external project (one without `@warpgogol/*` packages), 11 of its commands silently fail to register. The `forgeCompassModule` (8 commands) and `forgeWerkstattModule` (3 commands) dynamically import `@warpgogol/site-kernel-checks` and `@warpgogol/site-kernel-handoff` via `try/catch` — when those private packages are absent, the catch block swallows the error and no commands are registered.

This "graceful skip" pattern was established by RFC-0374 as a pragmatic compromise: forge would work in autonomous mode with a reduced command set, and the full set would activate inside the Warpgogol monorepo where kernel packages are available. The CLI explicitly documents this in `packages/forge/bin/cli.ts:151-158`:

```ts
// compass and werkstatt modules try to import @warpgogol/* packages — they'll
// gracefully skip registration in autonomous mode.
await import("../os/compass/compass.module.ts")
  .then((m) => m.forgeCompassModule)
  .catch(() => null),
await import("../os/werkstatt/werkstatt.module.ts")
  .then((m) => m.forgeWerkstattModule)
  .catch(() => null),
```

The affected commands enforce DNA-42 (Compass markup contract), DNA-43 (Compass semantic-truth audit), and DNA-51 (Werkstatt consistency primitives). Without these commands, forge in external projects cannot validate Compass scaffolding, run audit cycles, or manage werkstatt locks — core governance capabilities are silently missing.

## Problem

DNA-42, DNA-43, and DNA-51 are enforced by commands that do not exist in autonomous mode. An external project installing `@warpgogol/forge` gets `compass.validate`, `compass.inventory`, `compass.audit.*`, `werkstatt.lock.*`, and `werkstatt.operation.validate` silently dropped from the command registry. The operator discovers this only when a command is not found — there is no warning, no diagnostic, no `forge.doctor` check for missing commands.

The root cause is a dependency inversion gap: forge already inlines several utilities from `@warpgogol/*` packages (`writeFileAtomic`, `buildGeneratedHeader`, `collectFiles`, `byteHash` in `src/utils/`) to maintain autonomy, but the compass and werkstatt command **implementations** were left as dynamic imports to private kernel packages. This is inconsistent with the established pattern and creates a split-brain architecture where some commands are autonomous and others are not.

## Decision

Forge inlines all 11 compass and werkstatt command implementations directly into `packages/forge/os/compass/handlers/` and `packages/forge/os/werkstatt/handlers/`, eliminating the dynamic `@warpgogol/*` imports. The `try/catch` skip pattern in `bin/cli.ts` is removed — all modules load unconditionally. `site-kernel-checks` and `site-kernel-handoff` become thin delegation wrappers that import from forge (dependency inversion), matching the pattern already established for `writeFileAtomic` and `buildGeneratedHeader`.

## Architectural fit

- **DNA-42 (Compass markup contract):** Enforced by `compass.validate` and `compass.summary.trim`. Currently silent in autonomous mode — this RFC makes them always available.
- **DNA-43 (Compass semantic-truth audit):** Enforced by `compass.audit.plan/record/baseline/validate`. Currently silent in autonomous mode — this RFC makes them always available with git-history-only revision tracking (safe-degradation when git is absent: revision=0, warn not fail).
- **DNA-51 (Werkstatt consistency primitives):** Enforced by `werkstatt.lock.status`, `werkstatt.lock.recover`, `werkstatt.operation.validate`. Currently silent in autonomous mode — this RFC makes them always available.
- **RFC-0374 (amended):** Established the "graceful skip" pattern. This RFC eliminates it — all forge commands now load unconditionally.
- **Dependency inversion pattern:** Consistent with `writeFileAtomic` (moved from `@warpgogol/site-kernel/fs-atomic` to `forge/src/utils/fs-atomic.ts`) and `buildGeneratedHeader` (moved from `@warpgogol/site-kernel/generated-marker` to `forge/src/utils/generated-marker.ts`). This RFC extends the same pattern to command implementations.
- **Forge AGENTS.md import rules:** `os/` modules MAY dynamically import `@warpgogol/*` packages. After this RFC, `os/compass/` and `os/werkstatt/` no longer need this exception — they are fully autonomous.

## Design

### CLI surface

No CLI surface changes — all 11 commands keep their existing names, flags, and `--json` output shapes. The only change is that they now register and execute in projects without `@warpgogol/*` packages.

```sh
# These now work in any project with @warpgogol/forge installed:
forge run compass.inventory --json
forge run compass.validate --json
forge run compass.summary.trim --file <path>
forge run compass.changesummary.validate --file <path>
forge run compass.audit.plan --json
forge run compass.audit.record --file <path> --verdict pass
forge run compass.audit.baseline --json
forge run compass.audit.validate --json
forge run werkstatt.lock.status --json
forge run werkstatt.lock.recover --json
forge run werkstatt.operation.validate --json
```

### TypeScript contracts

Forge already defines autonomous runtime types in `src/types.ts` that are structurally compatible with `@warpgogol/site-kernel` types. The inlined command handlers use these existing types — no new type definitions needed.

Key utilities to inline into `forge/src/utils/` or `forge/os/compass/handlers/`:

```ts
// forge/src/utils/fs-idempotent.ts (new — missing from forge)
export function writeFileIfChanged(filePath: string, content: string): Promise<"written" | "unchanged">;

// forge/os/compass/handlers/compass-inventory.ts (new — from site-kernel)
export function createCompassInventoryEntries(rootDir: string, options: CompassScanOptions): CompassInventoryEntry[];

// forge/os/compass/handlers/resolve-scan-root.ts (new — from site-kernel)
// In autonomous mode, site-scoped scanning is not available. The function uses
// --packages/--package flags from input to determine the scan root. Default
// roots are apps/, packages/, services/ relative to workspaceRoot.
export function resolveCompassScanRoot(
  input: ForgeCommandInput,
  context: ForgeRuntimeContext,
): string | undefined;

// forge/os/compass/handlers/git-revision.ts (new — from site-kernel-integrity)
// Git-history-only fallback. Returns revision=1 when git is unavailable (matches
// existing site-kernel-integrity behavior — files treated as "just created", not
// "never audited"). The integrity-registry path is dropped entirely in the inlined
// version; autonomous mode uses git history only.
export interface GitRevisionResult {
  revision: number;
  entityId: string | null;
  contentHash: string;
}
export function getRevisionByPath(
  cwd: string,
  repoPath: string,
): Promise<GitRevisionResult>;

// forge/os/werkstatt/handlers/lock.ts (new — from site-kernel-handoff)
// Note: acquireLock/releaseLock take workspaceRoot as first parameter (not a
// params object) to match the existing site-kernel-handoff API shape.
export function readAllLocks(workspaceRoot: string): Promise<Array<WerkstattLock & { stale: boolean }>>;
export function acquireLock(workspaceRoot: string, scope: string, operationId: string, command: string, owner: string, timeoutSeconds?: number): Promise<WerkstattLock>;
export function releaseLock(workspaceRoot: string, scope: string): Promise<void>;
export function isLockStale(lock: WerkstattLock, now?: Date): boolean;

// forge/os/werkstatt/handlers/schema.ts (new — inlined from @warpgogol/ontology)
export const werkstattLockSchema: z.ZodSchema<WerkstattLock>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/compass/handlers/` | New — compass command implementations (inventory, validate, change-summary, audit) |
| `packages/forge/os/compass/compass.module.ts` | Changed — remove try/catch, import from handlers/ directly |
| `packages/forge/os/werkstatt/handlers/` | New — werkstatt command implementations (lock, operation-validate) |
| `packages/forge/os/werkstatt/werkstatt.module.ts` | Changed — remove try/catch, import from handlers/ directly |
| `packages/forge/src/utils/fs-idempotent.ts` | New — `writeFileIfChanged` (from site-kernel) |
| `packages/forge/bin/cli.ts` | Changed — remove `.catch(() => null)` for compass and werkstatt |
| `packages/forge/src/validators/port-validate.ts` | Changed — remove `@warpgogol/site-kernel-checks` and `@warpgogol/site-kernel-handoff` from `FORBIDDEN_IMPORTS` for os/ modules |
| `packages/os/site-kernel-checks/src/compass*.ts` | Changed — delegate to `@warpgogol/forge` implementations |
| `packages/os/site-kernel-handoff/src/werkstatt/*.ts` | Changed — delegate to `@warpgogol/forge` implementations |
| `packages/forge/AGENTS.md` | Changed — update OS modules table, remove "graceful skip" documentation |
| `packages/AGENTS.md` | Changed — update forge ownership entry: `os/` is no longer "kernel-dependent" for compass and werkstatt |
| Root `AGENTS.md` | Changed — update forge import rules: `os/compass/` and `os/werkstatt/` no longer need the `@warpgogol/*` dynamic import exception |

### Output format

No changes to `--json` output shapes. All 11 commands produce the same output structure as before.

### Failure modes

- **Git unavailable (autonomous mode):** `getRevisionByPath` returns `revision=1` (matching existing `site-kernel-integrity` behavior). Files are treated as "just created" — not immediately audit-overdue. `compass.audit.validate` emits warnings (not hard failures) for overdue files. The integrity-registry path is dropped entirely; autonomous mode uses git history only.
- **Missing `writeFileIfChanged` target directory:** Command fails with a clear error message (same as current behavior in kernel mode).
- **Invalid Compass scaffolding:** `compass.validate` emits diagnostics with the same rule IDs and severity levels as the kernel implementation.

## Rollout

- **Default behavior:** All 11 commands register unconditionally on `forge` startup. No flags, no opt-in, no graceful skip.
- **External projects (autonomous mode):** Commands work immediately after `npm install @warpgogol/forge`. Git-history-only fallback for audit revision tracking. No migration needed — these commands were previously missing, not broken.
- **Warpgogol monorepo (kernel mode):** `tools/kernel.config.ts` continues to register forge modules. Kernel-packages (`site-kernel-checks`, `site-kernel-handoff`) delegate to forge-inlined implementations via dependency inversion. No behavior change for existing pipelines — same command names, same output shapes.
- **Implementation order:**
  1. Inline compass handlers into `forge/os/compass/handlers/` + `forge/src/utils/fs-idempotent.ts`
  2. Inline werkstatt handlers into `forge/os/werkstatt/handlers/` + `werkstattLockSchema`
  3. Update `compass.module.ts` and `werkstatt.module.ts` to import from handlers/ (remove try/catch)
  4. Update `bin/cli.ts` to remove `.catch(() => null)`
  5. Update `port-validate.ts` forbidden imports list
  6. Convert `site-kernel-checks/src/compass*.ts` to delegate to forge
  7. Convert `site-kernel-handoff/src/werkstatt/*.ts` to delegate to forge
  8. Update `packages/forge/AGENTS.md` OS modules table
  9. Run `build:check` on all impacted packages
  10. Run `forge doctor` to verify no autonomy guard failures

## Alternatives considered

- **Separate `@warpgogol/compass-core` npm package:** Extract compass logic into a standalone package (based on the existing `@syrokomskyi/code-compass` from the `pipelines` repo). Rejected — adds package management overhead for ~800 lines of code. Inlining into forge is simpler and consistent with the werkstatt decision. The `code-compass` package remains available for non-forge consumers.

- **Keep graceful skip, add `forge.doctor` warning:** Instead of inlining, add a diagnostic that warns when commands are skipped. Rejected — the operator explicitly wants all commands functional in external projects, not just a warning that they are missing.

- **Conditional registration with feature flags:** Register commands but disable them via feature flags in `forge.yaml`. Rejected — adds complexity without solving the core problem. The commands need to work, not just be present-but-disabled.

## Risks

- **Code duplication (~2200 lines):** Compass and werkstatt logic is inlined into forge (~2,235 lines across 13 files: `compass-inventory.ts` 522, `compass.ts` handlers ~293, `compass-audit.ts` 382, `compass-change-summary.ts` 286, `resolve-compass-scan-root.ts` 73, `fs-idempotent.ts` 42, `compass-audit-helpers.ts` 67, `git.ts` ~25, `werkstatt-lock-status.ts` 71, `werkstatt-lock-recover.ts` 174, `lock.ts` 145, `werkstatt-operation-validate.ts` 105, `werkstatt.ts` schema ~50). Mitigated by dependency inversion — kernel-packages delegate to forge, so there is one implementation, not two.
- **Audit revision accuracy in autonomous mode:** Git-history-only `getRevisionByPath` may count revisions differently than the integrity-registry-based approach. Acceptable — audit is a governance tool, not a build gate, and safe-degradation (revision=1, warn) prevents false failures.
- **`port-validate.ts` relaxation:** Removing `@warpgogol/site-kernel-checks` and `@warpgogol/site-kernel-handoff` from `FORBIDDEN_IMPORTS` for os/ modules weakens the autonomy guard. Mitigated by the fact that os/compass/ and os/werkstatt/ will no longer import from those packages at all — the guard becomes unnecessary for these modules.
- **Agent misinterpretation:** Agents may assume compass/werkstatt commands are still kernel-dependent after reading old AGENTS.md sections. Mitigated by updating `packages/forge/AGENTS.md` to remove "graceful skip" language.

## Acceptance criteria

- [ ] All 11 compass and werkstatt command handlers exist in `packages/forge/os/compass/handlers/` and `packages/forge/os/werkstatt/handlers/`
- [ ] `forgeCompassModule` and `forgeWerkstattModule` import from handlers/ without any `try/catch` or dynamic `@warpgogol/*` imports
- [ ] `bin/cli.ts` loads compass and werkstatt modules without `.catch(() => null)`
- [ ] `writeFileIfChanged` utility exists in `packages/forge/src/utils/fs-idempotent.ts`
- [ ] `getRevisionByPath` works with git-history-only fallback (returns 1 when git is unavailable, matching existing `site-kernel-integrity` behavior)
- [ ] `site-kernel-checks/src/compass*.ts` delegates to `@warpgogol/forge` implementations
- [ ] `site-kernel-handoff/src/werkstatt/*.ts` delegates to `@warpgogol/forge` implementations
- [ ] `packages/forge/AGENTS.md` updated — OS modules table no longer mentions "graceful skip" for compass and werkstatt
- [ ] `packages/forge/src/validators/port-validate.ts` updated — `FORBIDDEN_IMPORTS` adjusted for os/compass and os/werkstatt
- [ ] `build:check` passes on `forge`, `site-kernel-checks`, `site-kernel-handoff`
- [ ] `forge doctor` passes with no autonomy guard failures
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When inlining compass handlers, copy logic from `packages/os/site-kernel-checks/src/compass.ts`, `compass-audit.ts`, and `compass-change-summary.ts`. Adapt types to use `ForgeRuntimeContext` instead of `KernelRuntimeContext`. Note: `resolveCompassScanRoot` accesses `context.site`/`context.siteExplicit` in kernel mode — in autonomous mode, these fields are absent; the function uses `--packages`/`--package` flags from `input` and defaults to scanning `apps/`, `packages/`, `services/` relative to `workspaceRoot`.
- `werkstatt-operation-validate.ts` uses `context.io.readFile(filePath)` (the `WorkspaceIO` abstraction) in kernel mode. The inlined version must use `node:fs/promises` `readFile` directly — `ForgeRuntimeContext` has no `io` field.
- `getRevisionByPath` should use `git log --follow --diff-filter=AMT --format=%H -- <file>` and count output lines (matching existing `site-kernel-integrity/src/git.ts` implementation). Wrap in try/catch — return `revision=1` on any git error (not `0`). The `--diff-filter=AMT` flag excludes deleted files from the count. The integrity-registry path (`loadPathsCurrent`/`loadEntitiesById`) is dropped entirely in the inlined version.
- When inlining werkstatt handlers, copy logic from `packages/os/site-kernel-handoff/src/werkstatt/lock.ts`, `werkstatt-lock-status.ts`, `werkstatt-lock-recover.ts`, and `packages/os/site-kernel-checks/src/werkstatt-operation-validate.ts`. Inline `werkstattLockSchema` from `packages/ontology/src/operations/werkstatt.ts`.
- After inlining, convert kernel-package files to thin delegation wrappers: `export { runCompassInventory } from '@warpgogol/forge'` (or equivalent).
- Run `forge doctor` after implementation to verify no `@warpgogol/*` import violations in forge source.
