---
id: RFC-0626
title: "Eliminate mission workflow friction from timestamp allowlist gaps and bordbuch pipeline side-effects"
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
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt: 2026-07-31
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0602
  - RFC-0604
  - RFC-0580
  - RFC-0473
  - RFC-0375
  - RFC-0600
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-51
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
  added:
    - bordbuch.commit
  changed:
    - generated.timestamp.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "generated.timestamp.validate reports zero TS-TIME-01 violations for modules in GENERATOR_OWNERSHIP_MAP that use volatile timestamps for runtime logic and are listed in TIMESTAMP_ALLOWLIST."
  - "generated.timestamp.validate reports TS-TIME-02 (allowlist parity) error when a module in GENERATOR_OWNERSHIP_MAP uses a volatile timestamp pattern but is missing from TIMESTAMP_ALLOWLIST."
  - "After build.prepare, the cache clone for any system has zero uncommitted bordbuch projection files (bordbuch.json, bordbuch/index.html, status.generated.yaml)."
  - "mission.validate, mission.close, and release.prepare complete without cache-clone dirty warnings for bordbuch files."
nonGoals:
  - "Do not replace the manual allowlist with automated data-flow analysis to distinguish runtime timestamp usage from generated-file timestamp usage — the allowlist approach is sufficient and maintainable."
  - "Do not change bordbuch.generate to write projections to the workpiece instead of the cache clone — RFC-0473 path conventions are preserved."
  - "Do not add bordbuch.generate to the dev-mode subset pipeline — it acquires Werkstatt locks and remains excluded per RFC-0604."
  - "Do not auto-commit non-bordbuch files in the cache clone — only bordbuch projection files (bordbuch.json, bordbuch/index.html, status.generated.yaml) are auto-committed by the pipeline step."
  - "Do not change the bordbuch.generate command handler itself — it remains single-responsibility (generate projections via writeFileIfChanged). The auto-commit is a separate pipeline step."
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

# RFC-0626: Eliminate mission workflow friction from timestamp allowlist gaps and bordbuch pipeline side-effects

## Context

Mission `warpgogol-com-m000023` (completed 2026-07-31) encountered two friction points during the `wg-mission-complete` workflow:

1. **TS-TIME-01 false positive on `content-freshness.ts`**: `generated.timestamp.validate` (RFC-0602) flagged `new Date().toISOString()` at `packages/os/site-kernel-checks/src/content-freshness.ts:69` as a volatile timestamp violation. The `todayIso()` function is a runtime validator that compares claim validity windows against the current date — it is not a generated-file timestamp field. The module was registered in `GENERATOR_OWNERSHIP_MAP` (because it generates `src/freshness.generated.yaml`) but was missing from `TIMESTAMP_ALLOWLIST`. Five other modules with similar runtime timestamp usage were already allowlisted (`passport.ts`, `content-ledger.ts`, `surface-demand.ts`, `surface-breaker.ts`, `ecosystem-commit.ts`), but `content-freshness.ts` was missed during the initial RFC-0602 implementation. The module has since been added to `TIMESTAMP_ALLOWLIST` manually — but the parity check proposed in this RFC would have caught this gap automatically, preventing the friction during mission completion.

2. **Dirty cache clone after `build.prepare`**: `bordbuch.generate` (added to `build.prepare` by RFC-0604) writes bordbuch projection files (`bordbuch.json`, `bordbuch/index.html`, `status.generated.yaml`) directly to the cache clone via `writeFileIfChanged`. However, `build.prepare` does not commit these files, leaving the cache clone dirty after every `mission.validate`, `mission.close`, and `release.prepare` invocation. The operator must manually `git add + commit` in the cache clone before `mission.reconcile` can proceed. This breaks the "clean cache clone" invariant expected by the mission workflow.

## Problem

Two gaps create recurring friction during mission completion:

### Gap 1: Allowlist parity is not enforced

`generated.timestamp.validate` (RFC-0602) scans modules in `GENERATOR_OWNERSHIP_MAP` for volatile timestamp patterns (`new Date().toISOString()`, `new Date()`, `Date.now()`). Modules that use these patterns for runtime logic (not generated-file fields) are exempted via `TIMESTAMP_ALLOWLIST`. However, there is no automated check that verifies every module in `GENERATOR_OWNERSHIP_MAP` that uses a volatile timestamp is present in `TIMESTAMP_ALLOWLIST`.

This means:

1. When a new module is added to `GENERATOR_OWNERSHIP_MAP` and uses `new Date()` for runtime logic, the developer must remember to add it to `TIMESTAMP_ALLOWLIST`.
2. If they forget, `generated.timestamp.validate` produces a false-positive `TS-TIME-01` error during the next `mission.validate`, blocking the mission workflow.
3. The fix is always the same: add the module to `TIMESTAMP_ALLOWLIST` with a reason explaining why the timestamp is runtime logic, not a generated-file field.

This relies on manual discipline — the same class of problem that RFC-0580 solved for werkstatt side-effects and RFC-0600 solved for stale generated files.

### Gap 2: `build.prepare` leaves bordbuch projections uncommitted in cache clone

`bordbuch.generate` (RFC-0604, step 57/61 in `build.prepare`) writes projection files to the cache clone via `writeFileIfChanged`. The command itself is pipeline-safe (no git commits, no bordbuch entry creation — per its MODULE_CONTRACT). However, `build.prepare` does not commit these files after generation.

This means:

1. After `mission.validate` (which runs `build.prepare`), the cache clone has 3 dirty bordbuch files.
2. `mission.reconcile` refuses to proceed with a dirty cache clone (EC-03 in `fix-patterns.md`).
3. The operator must manually `git add + commit` in the cache clone before continuing.
4. The same dirty state reappears after `mission.close` and `release.prepare` (both run `build.prepare`).

RFC-0580 established the pattern of auto-committing werkstatt side-effects from mission lifecycle commands. RFC-0477 established auto-commit for bordbuch entries. But `build.prepare`'s bordbuch.generate step was added later (RFC-0604) and was not covered by either auto-commit pattern.

## Decision

The `generated.timestamp.validate` command gains a Phase 2 allowlist parity check (rule `TS-TIME-02`) that errors when a module in `GENERATOR_OWNERSHIP_MAP` uses a volatile timestamp pattern but is missing from `TIMESTAMP_ALLOWLIST`. The `build.prepare` pipeline gains a `bordbuch.commit` step after `bordbuch.generate` — a new registered kernel command that auto-commits dirty bordbuch projection files in the cache clone.

## Architectural fit

- **DNA-51 (Werkstatt consistency primitives)** — The `bordbuch.commit` pipeline step extends the auto-commit pattern established by RFC-0580 (werkstatt side-effects) and RFC-0477 (bordbuch entries) to cover `build.prepare`'s bordbuch.generate side-effects, closing the last gap in git hygiene for mission workflow. The parity check ensures RFC-0602's timestamp determinism contract is complete by verifying no generator module using volatile timestamps is missing from the allowlist.
- **RFC-0602 (timestamp determinism)** — The parity check is a natural extension of the existing `generated.timestamp.validate` command. It does not change Phase 1 scanning logic; it adds a Phase 2 cross-reference check between `GENERATOR_OWNERSHIP_MAP` and `TIMESTAMP_ALLOWLIST`.
- **RFC-0604 (bordbuch.generate in build.prepare)** — The `bordbuch.commit` step complements RFC-0604 by ensuring the projections generated by `bordbuch.generate` are committed, not left as dirty working-tree state.
- **RFC-0580 (auto-commit werkstatt side-effects)** — The `bordbuch.commit` step follows the same pattern as `commitWerkstattSideEffects` from RFC-0580: idempotent skip when no changes, specific file paths (not `git add -A`), conventional commit message.
- **RFC-0473 (bordbuch command family)** — The `bordbuch.commit` step does not modify `bordbuch.generate` itself; it is a separate pipeline step that runs after `bordbuch.generate` completes.
- **Site OS operator model** — The parity check is internal to an existing command. `bordbuch.commit` is a new registered command but is documented as an internal pipeline step — it is not intended for direct operator use and is not added to CLI documentation surfaces.

## Design

### Phase 1: Allowlist parity check in `generated.timestamp.validate`

#### CLI surface

No new CLI commands. The change is internal to the existing `generated.timestamp.validate` command:

```sh
pnpm exec site-kernel run generated.timestamp.validate --site warpgogol-com
```

The command now performs two phases:

1. **Phase 1 (existing)**: Scan modules in `GENERATOR_OWNERSHIP_MAP` for volatile timestamp patterns. Allowlisted modules report as info-severity exemptions.
2. **Phase 2 (new)**: For each module in `GENERATOR_OWNERSHIP_MAP` that has volatile timestamp violations but is NOT in `TIMESTAMP_ALLOWLIST`, emit `TS-TIME-02` error.

#### TypeScript contracts

```ts
const RULE_ID_PARITY = "TS-TIME-02";

interface ParityViolation {
  module: string;
  patterns: string[];
}

/**
 * Phase 2: Check that every module in GENERATOR_OWNERSHIP_MAP
 * that uses volatile timestamp patterns is present in TIMESTAMP_ALLOWLIST.
 * Modules with violations but no allowlist entry are TS-TIME-02 errors.
 *
 * Reuses the scan results from Phase 1 (returned via a refactored
 * runPhase1 that exposes a Map<string, { line: number; pattern: string }[]>
 * alongside diagnostics) — no additional file I/O.
 */
function checkAllowlistParity(
  scanResults: Map<string, { line: number; pattern: string }[]>,
  allowlistModules: Set<string>,
): Diagnostic[];
```

The `runPhase1` function is refactored to return both `Diagnostic[]` and a `Map<string, { line: number; pattern: string }[]>` of raw scan results. The parity check iterates this map — modules with non-empty violations that are NOT in `allowlistModules` produce `TS-TIME-02` errors.

The parity check runs after Phase 1 scanning, reusing the scan results returned by the refactored `runPhase1`. For each module in `scanResults`:

1. If violations found AND module is NOT in `allowlistModules` → emit `TS-TIME-02` error.
2. If violations found AND module IS in `allowlistModules` → already reported as info in Phase 1 (no duplicate).
3. If no violations → no diagnostic (same as Phase 1).

#### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` | Modified: add Phase 2 parity check, refactor `runPhase1` to expose scan results |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Read: source of `GENERATOR_OWNERSHIP_MAP` |

#### Output format

```json
{
  "command": "generated.timestamp.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "TS-TIME-02",
      "severity": "error",
      "message": "Module packages/os/site-kernel-checks/src/content-freshness.ts uses volatile timestamp patterns [new Date().toISOString()] but is missing from TIMESTAMP_ALLOWLIST. If this is runtime logic (not a generated-file field), add it to the allowlist with a reason.",
      "file": "packages/os/site-kernel-checks/src/content-freshness.ts"
    }
  ]
}
```

#### Failure modes

- `TS-TIME-02` is an error-severity diagnostic — the command exits non-zero.
- The fix is always: add the module to `TIMESTAMP_ALLOWLIST` with a `reason` explaining why the timestamp is runtime logic, or remove the volatile timestamp pattern if it is actually a generated-file field.
- No warning-only mode — the parity check is fail-hard. A missing allowlist entry is always an error because it indicates an incomplete RFC-0602 implementation.

### Phase 2: `bordbuch.commit` pipeline step in `build.prepare`

#### CLI surface

`bordbuch.commit` is a new registered kernel command in the bordbuch module (`@warpgogol/site-kernel-handoff`). It is primarily intended as a pipeline step, but is technically callable by operators (like all registered commands). The command is not added to any CLI documentation surface and is documented as "internal pipeline step" in its MODULE_CONTRACT.

```sh
pnpm exec site-kernel run build.prepare --site warpgogol-com
```

The pipeline now includes a `bordbuch.commit` step after `bordbuch.generate`:

```ts
// In SITES_BUILD_PREPARE_PIPELINE:
{ command: "bordbuch.generate",  label: "Bordbuch status" },
{ command: "bordbuch.commit",    label: "Bordbuch commit"  },  // new
{ command: "passport.key.ensure", label: "Passport key ensure" },
```

The `bordbuch.commit` step is excluded from the dev-mode subset pipeline (`SITES_BUILD_PREPARE_DEV_PIPELINE`) for the same reasons as `bordbuch.generate` (Werkstatt locks, side effects).

#### TypeScript contracts

```ts
/**
 * Auto-commits dirty bordbuch projection files in the cache clone.
 * Idempotent: skips commit if no bordbuch files are dirty.
 * Only stages bordbuch projection files — never `git add -A`.
 *
 * @param workspaceRoot - monorepo root directory
 * @param systemId - system identifier (e.g. "warpgogol-com")
 * @returns { committed: boolean; commitSha: string | null }
 */
async function commitBordbuchProjections(
  workspaceRoot: string,
  systemId: string,
): Promise<{ committed: boolean; commitSha: string | null }>;
```

The helper:

1. Resolves the cache clone path via `resolveCachePath(workspaceRoot, systemId)`.
2. Runs `git status --porcelain` in the cache clone.
3. Filters for bordbuch projection files only: `bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`.
4. If no matching dirty files → return `{ committed: false, commitSha: null }`.
5. If matching dirty files → `git add <specific paths>` + `git commit -m "chore: bordbuch projections from build.prepare"`.
6. Returns `{ committed: true, commitSha: <sha> }`.

The helper reuses `gitExec` from `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` (the same utility used by RFC-0580's `commitWerkstattSideEffects` and RFC-0477's `commitAndPushBordbuch`).

#### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Modified: add `bordbuch.commit` step to pipeline array |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` | New: `commitBordbuchProjections` helper + `runBordbuchCommit` command handler |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts` | Unchanged: remains single-responsibility |
| `packages/os/site-kernel-handoff/src/bordbuch/index.ts` | Modified: export `runBordbuchCommit` |
| `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` | Read: `gitExec` utility (reused, not modified) |
| `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` | Read: `resolveCachePath` (reused, not modified) |
| `systems/<id>/bordbuch/status.generated.yaml` | Auto-committed by `bordbuch.commit` |
| `systems/<id>/public/.well-known/bordbuch.json` | Auto-committed by `bordbuch.commit` |
| `systems/<id>/public/.well-known/bordbuch/index.html` | Auto-committed by `bordbuch.commit` |

#### Failure modes

- If `git commit` fails (e.g. pre-commit hook block), the step throws with a clear error message indicating which bordbuch files could not be committed.
- If the cache clone path cannot be resolved (system not in registry), the command returns a no-op summary. In practice this is unreachable when `bordbuch.commit` follows `bordbuch.generate` in the pipeline (since `bordbuch.generate` already resolves the cache path and throws on failure), but the guard is retained for defensive correctness when the command is called standalone.
- If non-bordbuch files are dirty in the cache clone, they are NOT committed by this step — the step only stages the three bordbuch projection paths. Other dirty files remain and are reported by the existing `mission.validate` dirty-cache-clone warning.

## Rollout

### Phase 1: Allowlist parity check

- **Default behavior**: fail-hard from day one. The `TS-TIME-02` rule is an error — there is no grace period because the fix is always a one-line allowlist addition.
- **Existing apps**: No migration needed. All currently-allowlisted modules are already in `TIMESTAMP_ALLOWLIST`. The parity check only catches modules that were missed.
- **New apps**: Automatically compliant — any new module added to `GENERATOR_OWNERSHIP_MAP` that uses volatile timestamps will be caught by `TS-TIME-02` on the next `build.check`.
- **Pipeline integration**: `generated.timestamp.validate` is already in `build.check` (step ~150/196). The parity check runs within the same command invocation — no new pipeline step needed.

### Phase 2: `bordbuch.commit` pipeline step

- **Default behavior**: active from day one. The `bordbuch.commit` step runs after `bordbuch.generate` in every `build.prepare` invocation (except dev-mode subset).
- **Existing apps**: No migration needed. The step is idempotent — if bordbuch files are not dirty, it is a no-op.
- **New apps**: Automatically compliant — any system with a cache clone will have bordbuch projections auto-committed.
- **Pipeline integration**: Added to `SITES_BUILD_PREPARE_PIPELINE` after `bordbuch.generate`. Excluded from `SITES_BUILD_PREPARE_DEV_PIPELINE` (same exclusion as `bordbuch.generate`).
- **No new CLI command**: `bordbuch.commit` is a registered kernel command (required for pipeline step execution) but is documented as an internal pipeline step. Operators are not expected to invoke it directly.

## Alternatives considered

### Phase 1: Data-flow analysis instead of allowlist parity check

**Rejected.** Automated data-flow analysis to distinguish runtime timestamp usage (e.g., comparing claim validity windows) from generated-file timestamp fields (e.g., writing `createdAt` to output) would require a TypeScript AST analyzer with taint tracking. This is disproportionate to the problem — the allowlist approach has zero false positives, is human-readable, and the parity check ensures no module is missed. Data-flow analysis would add maintenance burden and potential false negatives.

### Phase 1: Manual allowlist expansion with comment reminder

**Rejected.** Relying on developers to remember adding modules to `TIMESTAMP_ALLOWLIST` when they add them to `GENERATOR_OWNERSHIP_MAP` is the same manual-discipline approach that caused the original gap. A comment reminder in `GENERATOR_OWNERSHIP_MAP` does not enforce anything — it is advisory only. The parity check is automated and fail-hard.

### Phase 2: Write bordbuch projections to workpiece instead of cache clone

**Rejected.** Routing `bordbuch.generate` output to the workpiece (`missions/<id>/workpiece/`) instead of the cache clone would require changing path resolution in multiple validators (`generated.files.validate` RFC-0375, `generated.stale.validate` RFC-0600) and would violate RFC-0473's path conventions (projections live next to the ledger in the cache clone). It would also require a fallback path for non-mission `build.prepare` invocations where no workpiece exists. The auto-commit post-step achieves the same result (clean cache clone) with minimal blast radius.

### Phase 2: Make `bordbuch.generate` a no-op in `build.prepare` context

**Rejected.** RFC-0604 added `bordbuch.generate` to `build.prepare` specifically to ensure bordbuch projections are regenerated before validation. Making it a no-op would break RFC-0604's success signals ("After running build.prepare, systems/<id>/public/.well-known/bordbuch.json exists and is up to date") and reintroduce the missing-output problem that RFC-0604 was created to solve.

### Phase 2: Add `--auto-commit` flag to `bordbuch.generate`

**Rejected.** Adding a flag to `bordbuch.generate` would mix generation and git-commit responsibilities in a single command, violating single-responsibility principle. The `bordbuch.generate` MODULE_CONTRACT explicitly states: "Does not append events — use bordbuch.append for that." Adding git commit would expand the contract scope. A separate pipeline step keeps `bordbuch.generate` clean and follows the RFC-0580 pattern of separate commit helpers.

## Risks

- **False positive in parity check**: If a module in `GENERATOR_OWNERSHIP_MAP` uses `new Date()` in a string literal or comment (not actual code), the parity check would flag it. Mitigation: `scanModuleForTimestamps` already strips comments and string literals via `stripCommentsAndStrings` (line 106-170 of `generated-timestamp-validate.ts`), so this risk is already handled.
- **Agent confusion about TS-TIME-02**: Agents encountering `TS-TIME-02` might try to remove the `new Date()` call instead of adding the module to the allowlist. Mitigation: the error message explicitly says: "If this is runtime logic (not a generated-file field), add it to the allowlist with a reason."
- **Cache clone commit conflicts**: If the cache clone has other dirty files (not bordbuch), `bordbuch.commit` only stages bordbuch files. Other dirty files remain and are still reported by `mission.validate`'s dirty-cache-clone warning. This is intentional — `bordbuch.commit` does not mask other hygiene issues.
- **Non-mission `build.prepare`**: When `build.prepare` is run directly (not in a mission context), the cache clone may not exist or may not be relevant. Mitigation: `commitBordbuchProjections` resolves the cache path via `resolveCachePath` and skips with a warning if the path cannot be resolved.
- **Performance**: The parity check reuses the same `scanModuleForTimestamps` results from Phase 1 — `runPhase1` is refactored to return a `Map<string, { line: number; pattern: string }[]>` alongside diagnostics, so the parity check iterates the map without additional file I/O. The `bordbuch.commit` step runs `git status --porcelain` (fast) and optionally `git add + commit` (only when dirty). Both have negligible performance impact.

## Acceptance criteria

- [x] `generated.timestamp.validate` emits `TS-TIME-02` error when a module in `GENERATOR_OWNERSHIP_MAP` uses volatile timestamp patterns but is missing from `TIMESTAMP_ALLOWLIST` (evidence: `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts:259-279`, `packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts:255-266`)
- [x] `generated.timestamp.validate` passes with zero violations after all runtime-logic modules are allowlisted (evidence: `pnpm exec site-kernel run generated.timestamp.validate --mode fail --json` exits 0 with zero TS-TIME-02 diagnostics, 2026-07-31)
- [x] `build.prepare` pipeline includes `bordbuch.commit` step after `bordbuch.generate` (evidence: `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:126`, `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts:58-70`)
- [x] `bordbuch.commit` step is excluded from `SITES_BUILD_PREPARE_DEV_PIPELINE` (evidence: `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts:73-75`)
- [x] After `build.prepare`, cache clone has zero uncommitted bordbuch projection files (evidence: `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts:62-63` stages all three bordbuch paths, `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts:91-99` verifies commit on dirty files)
- [x] `commitBordbuchProjections` helper only stages bordbuch projection paths, never `git add -A` (evidence: `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts:62-63`, `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts:113-125`)
- [x] `mission.validate`, `mission.close`, and `release.prepare` complete without cache-clone dirty warnings for bordbuch files (evidence: `bordbuch.commit` runs in `SITES_BUILD_PREPARE_PIPELINE` before `generated.files.validate`, ensuring bordbuch projections are committed before any mission validation reads cache clone state; `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:123-126`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0626 --json` exits 0, 2026-07-31)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When implementing Phase 1, agents MUST reuse `scanModuleForTimestamps` and `stripCommentsAndStrings` from the existing `generated-timestamp-validate.ts` — do not duplicate scanning logic.
- When implementing Phase 2, agents MUST reuse `gitExec` from `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` — do not duplicate git utilities. The `commitBordbuchProjections` helper follows the same pattern as `commitWerkstattSideEffects` (RFC-0580).
- `bordbuch.commit` is a registered kernel command (in the bordbuch module) but is documented as an internal pipeline step. It is technically callable by operators (like all registered commands) but is not intended for direct use. Its MODULE_CONTRACT states: "Internal pipeline step — auto-commits bordbuch projections after bordbuch.generate. Not intended for direct operator invocation."
- The `bordbuch.commit` step MUST only stage the three bordbuch projection paths (`bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`). It MUST NOT use `git add -A` or `git add .`.
