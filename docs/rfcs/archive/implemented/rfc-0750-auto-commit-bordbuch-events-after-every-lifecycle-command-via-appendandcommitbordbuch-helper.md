---
id: RFC-0750
title: "Auto-commit bordbuch events after every lifecycle command via appendAndCommitBordbuch helper"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-48
  - DNA-49
  - DNA-51
  - RFC-0477
  - RFC-0580
  - RFC-0626
  - RFC-0702
  - RFC-0749
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-48
  - DNA-49
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
  proposed:
    - bordbuch.commit.parity.lint
  added:
    - bordbuch.commit.parity.lint
  changed:
    - mission.open
    - mission.close
    - mission.abort
    - mission.materialize
    - mission.migrate
    - sternsystem.extract
    - sternsystem.sync
    - release.ready
    - release.rollback
    - leitstand.propagate
    - leitstand.promote
    - leitstand.rollback
    - nachweis.ingest
    - nachweis.publish
    - nachweis.withdraw
    - nachweis.sign
    - nachweis.approve
    - nachweis.consent.update
    - nachweis.public-derivative
    - nachweis.timestamp
    - bordbuch.commit
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-handoff
  - site-kernel-checks
successSignals:
  - "No lifecycle command leaves dirty bordbuch/events.ndjson in the cache clone after successful completion"
  - "bordbuch.commit.parity.lint flags any direct appendBordbuchEntry call outside the whitelist"
  - "All 20 migrated commands use appendAndCommitBordbuch instead of separate append + commit calls"
nonGoals:
  - "Does not change bordbuch.append command behavior — it remains a low-level escape hatch"
  - "Does not remove bordbuch.commit pipeline step — it remains for projection files with events.ndjson as defense-in-depth"
  - "Does not change bordbuch event schema or hash-chain format"
  - "Does not add push retry logic beyond what commitAndPushBordbuch already does"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0750: Auto-commit bordbuch events after every lifecycle command via appendAndCommitBordbuch helper

## Context

RFC-0477 established the `commitAndPushBordbuch` helper and mandated its use after `appendBordbuchEntry` in mission lifecycle commands (`mission.open`, `mission.close`, `mission.abort`) and `sternsystem.sync`. This ensured bordbuch events were committed and pushed to the cache clone git repo immediately after append.

However, 16 other commands that call `appendBordbuchEntry` never call `commitAndPushBordbuch`. These include release commands (`release.ready`, `release.rollback`), leitstand commands (`leitstand.propagate`, `leitstand.promote`, `leitstand.rollback`), mission commands (`mission.materialize`, `mission.migrate`), sternsystem commands (`sternsystem.extract`), and all 8 nachweis commands. Additionally, `mission.close` has a second call site (evidence-skipped escape hatch at line 423) that appends without committing. After these commands complete, `bordbuch/events.ndjson` in the cache clone is dirty — the event was appended to disk but never committed to git.

This was observed on 2026-08-08: after `mission.close` (m000037) and subsequent `release.ready` + `leitstand.propagate` + `leitstand.promote` for release r000014, the cache clone had 3 uncommitted bordbuch events (event-000034, event-000035, event-000036). The operator had to manually `cd` into the cache clone and commit them.

RFC-0749 addressed a related symptom — dirty bordbuch **projection** files after `mission.validate` — by adding a post-validation `commitBordbuchProjections` cleanup call. But that RFC only covers projection files (`status.generated.yaml`, `bordbuch.json`, `bordbuch/index.html`), not `events.ndjson` itself, and only in the `mission.validate` path.

## Problem

DNA-46 (Mission lifecycle) states that every mission is recorded in the Sternsystem's Bordbuch. DNA-48 (Release discipline) and DNA-49 (Fleet propagation) track release and deployment events in the same Bordbuch. Yet 16 commands that append bordbuch entries do not commit them, plus a second call site in `mission.close` (evidence-skipped escape hatch):

| Command | File | Line | Event kind |
| --- | --- | --- | --- |
| `release.ready` | `release/release-commands.ts` | 706 | `release-ready` |
| `release.rollback` | `release/release-commands.ts` | 899 | `release-rolled-back` |
| `leitstand.propagate` | `leitstand/leitstand-commands.ts` | 1958 | `deployment` |
| `leitstand.promote` | `leitstand/leitstand-commands.ts` | 2245 | `deployment` |
| `leitstand.rollback` | `leitstand/leitstand-commands.ts` | 2553 | `release-rolled-back` |
| `mission.materialize` | `mission/mission-materialize.ts` | 1211, 1225 | `preflight-skipped` |
| `mission.migrate` | `mission/mission-migrate.ts` | 227 | `mission-migrate` |
| `sternsystem.extract` | `sternsystem/sternsystem-extract.ts` | 139 | `pin-update` |
| `nachweis.ingest` | `nachweis/nachweis-ingest.ts` | 168 | `nachweis-record` |
| `nachweis.publish` | `nachweis/nachweis-publish.ts` | 175 | `nachweis-record` |
| `nachweis.withdraw` | `nachweis/nachweis-withdraw.ts` | 139, 152 | `nachweis-consent`, `nachweis-record` |
| `nachweis.sign` | `nachweis/nachweis-sign.ts` | 171 | `nachweis-signed` |
| `nachweis.approve` | `nachweis/nachweis-approve.ts` | 157 | `nachweis-record` |
| `nachweis.consent.update` | `nachweis/nachweis-consent.ts` | 120 | `nachweis-consent` |
| `nachweis.public-derivative` | `nachweis/nachweis-public-derivative.ts` | 174 | `nachweis-record` |
| `nachweis.timestamp` | `nachweis/nachweis-timestamp.ts` | 141 | `nachweis-timestamped` |

This relies on manual discipline: the operator must notice dirty `events.ndjson` in the cache clone and commit it manually. If they don't, the next `mission.validate` emits a dirty cache clone warning (RFC-0522), and `mission.reconcile` may fail.

There is also no lint or validator that prevents new commands from calling `appendBordbuchEntry` without committing. A new command added in the future can repeat the same gap silently.

## Decision

The kernel gains `appendAndCommitBordbuch` (single-entry) and `appendBatchAndCommitBordbuch` (multi-entry) helpers in `bordbuch/bordbuch-commit-helper.ts` that combine `appendBordbuchEntry` + `commitAndPushBordbuch` into one atomic operation. All 20 commands that append bordbuch entries are migrated to these helpers. `commitAndPushBordbuch` becomes internal to `bordbuch-io.ts` (no longer exported). A new `bordbuch.commit.parity.lint` command flags any direct `appendBordbuchEntry` call outside a 3-file whitelist. `bordbuch.commit` (pipeline step) adds `events.ndjson` to its projection paths as defense-in-depth.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Every mission event (open, materialize, migrate, close, abort) is now committed immediately via `appendAndCommitBordbuch`. Previously `mission.materialize` and `mission.migrate` left dirty bordbuch.
- **DNA-48 (Release discipline)**: `release.ready` and `release.rollback` bordbuch events are now committed immediately.
- **DNA-49 (Fleet propagation)**: `leitstand.propagate`, `leitstand.promote`, and `leitstand.rollback` bordbuch events are now committed immediately.
- **DNA-51 (Werkstatt consistency primitives)**: The new `bordbuch.commit.parity.lint` enforces that all commands use the shared `appendAndCommitBordbuch` helper, preventing future gaps.
- **RFC-0477**: Extends the bordbuch git synchronization contract from 4 commands to all 20 commands that append entries.
- **RFC-0580 (Auto-commit werkstatt side-effects)**: Parallel pattern — RFC-0580 auto-commits werkstatt-level files (registry.yaml, mission.yaml) from lifecycle commands. This RFC applies the same pattern to bordbuch events in the cache clone.
- **RFC-0749**: Complementary — RFC-0749 handles projection files after `mission.validate`; this RFC handles `events.ndjson` after all lifecycle commands.
- **Site OS operator model**: The helper lives in `packages/os/site-kernel-handoff/src/bordbuch/`, the same package that owns the Bordbuch command family (DNA-46, RFC-0473). The lint command lives in `packages/os/site-kernel-checks/` alongside other lint commands.
- **Scaling Playbook**: Applies uniformly — every Sternsystem benefits from clean bordbuch state regardless of growth stage.

## Design

### CLI surface

```sh
# New lint command
pnpm exec werkstatt run bordbuch.commit.parity.lint

# Existing commands — no CLI surface change, internal migration only
pnpm exec werkstatt run release.ready --release <id>
pnpm exec werkstatt run leitstand.propagate --site <id> --release <id>
```

The lint command takes no flags — it scans `packages/os/site-kernel-handoff/src/**/*.ts` statically.

### TypeScript contracts

```ts
// bordbuch/bordbuch-commit-helper.ts

interface BordbuchAppendOptions {
  missionId?: string | null;
  releaseId?: string | null;
  writerRole?: string;
  metadata?: Record<string, unknown>;
  status?: BordbuchEntry["status"];
  erratumOf?: string;
}

interface AppendAndCommitResult {
  entries: BordbuchEntry[];
  commitResult: CommitAndPushResult;
}

// Single-entry helper — replaces appendBordbuchEntry + commitAndPushBordbuch
export async function appendAndCommitBordbuch(
  workspaceRoot: string,
  systemId: string,
  kind: BordbuchEntryKind,
  summary: string,
  actor: string,
  options?: BordbuchAppendOptions,
  commitMessage?: string,
): Promise<AppendAndCommitResult>

// Batch helper — for commands that append multiple entries before committing
export async function appendBatchAndCommitBordbuch(
  workspaceRoot: string,
  systemId: string,
  entries: Array<{
    kind: BordbuchEntryKind;
    summary: string;
    actor: string;
    options?: BordbuchAppendOptions;
  }>,
  commitMessage: string,
): Promise<AppendAndCommitResult>
```

Both helpers:

1. Acquire `bordbuch:${systemId}` lock (reentrant-safe per existing lock implementation)
2. Append all entries via `appendBordbuchEntry`
3. Release `bordbuch:${systemId}` lock
4. Call internal `commitAndPushBordbuch` (commit + push to cache clone origin)
5. Return `{ entries, commitResult }` — does NOT throw on commit/push failure

The caller is responsible for checking `commitResult.commitSha` and `commitResult.pushed` if it needs hard guarantees (e.g., `mission.open` throws on null commitSha per ADR-0030).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.ts` | New file — `appendAndCommitBordbuch` and `appendBatchAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | `commitAndPushBordbuch` becomes non-exported (internal) |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` | Add `bordbuch/events.ndjson` to `BORDBUCH_PROJECTION_PATHS` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-append.ts` | Unchanged — remains in whitelist, uses low-level `appendBordbuchEntry` |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | Migrate `release.ready`, `release.rollback` to `appendAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Migrate `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback` |
| `packages/os/site-kernel-handoff/src/mission/mission-open.ts` | Migrate to `appendAndCommitBordbuch`, keep ADR-0030 push verification |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Migrate to `appendAndCommitBordbuch`, keep push verification |
| `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` | Migrate to `appendAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Migrate preflight-skipped entries to `appendAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` | Migrate to `appendAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` | Migrate to `appendAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | Migrate to `appendAndCommitBordbuch` |
| `packages/os/site-kernel-handoff/src/nachweis/*.ts` | Migrate all 8 nachweis commands to `appendAndCommitBordbuch` or `appendBatchAndCommitBordbuch` (withdraw) |
| `packages/os/site-kernel-checks/src/bordbuch-commit-parity-lint.ts` | New lint command |

### Whitelist for bordbuch.commit.parity.lint

Files allowed to call `appendBordbuchEntry` directly:

1. `bordbuch/bordbuch-io.ts` — function definition
2. `bordbuch/bordbuch-append.ts` — `bordbuch.append` command handler (low-level escape hatch)
3. `bordbuch/bordbuch-commit-helper.ts` — the new helper itself

Any other file importing or calling `appendBordbuchEntry` is a violation.

### Output format

```json
{
  "command": "bordbuch.commit.parity.lint",
  "status": "pass",
  "violations": []
}
```

On violation:

```json
{
  "command": "bordbuch.commit.parity.lint",
  "status": "fail",
  "violations": [
    {
      "file": "release/release-commands.ts",
      "rule": "direct-append-without-helper",
      "message": "appendBordbuchEntry called directly — use appendAndCommitBordbuch instead"
    }
  ]
}
```

### Failure modes

- `appendAndCommitBordbuch` does NOT throw on commit/push failure — returns `commitResult` with `commitSha: null` or `pushed: false`. Callers that need hard guarantees (mission.open per ADR-0030) check the result and throw themselves.
- `bordbuch.commit.parity.lint` exits non-zero on any violation. Integrated into `PACKAGES_CHECK_PIPELINE`.
- `bordbuch.commit` pipeline step: adding `events.ndjson` to projection paths is a no-op when the file is not dirty — `git add` on an unchanged file produces no staging.
- **Batch helper partial failure**: `appendBatchAndCommitBordbuch` appends all entries sequentially before committing. If an `appendBordbuchEntry` call fails mid-batch, already-appended entries are on disk but not committed. The helper does NOT roll back appended entries — the caller receives the error and must decide whether to commit the partial state via `commitAndPushBordbuch` (available internally) or retry the full batch. Currently only `nachweis.withdraw` uses the batch helper (2 entries: consent + record).

## Rollout

- **No flag day**: All 20 commands are migrated in a single implementation pass. No backward compatibility layer — `commitAndPushBordbuch` export is removed, all callers updated.
- **Lint integration**: `bordbuch.commit.parity.lint` is added to the `PACKAGES_CHECK_PIPELINE` (alongside `fingerprint.usage.lint` and `workspace.write.boundary.lint`) immediately. Since all callers are migrated in the same pass, the lint passes from day one.
- **No migration path for existing apps**: This is an internal kernel change — site workspaces are unaffected. No `.env` changes, no content changes, no schema changes.
- **`bordbuch.commit` pipeline step**: `events.ndjson` is added to `BORDBUCH_PROJECTION_PATHS`. This is defense-in-depth — if `appendAndCommitBordbuch` already committed the file, `bordbuch.commit` finds nothing to stage. If a future bug skips the helper, `bordbuch.commit` catches the dirty file.
- **New commands**: Any future command that needs to append bordbuch entries MUST use `appendAndCommitBordbuch` or `appendBatchAndCommitBordbuch`. The lint enforces this.

## Alternatives considered

1. **Post-command flush**: After every kernel command, check for dirty bordbuch in the cache clone and commit. Rejected — adds overhead to every command (even ones that never touch bordbuch), and operates after the command's own error handling, making it impossible for the command to react to commit failure.

2. **ESLint custom rule**: Implement the parity check as a custom ESLint rule in `eslint.config.js`. Rejected — inconsistent with the existing lint pattern (`fingerprint.usage.lint`, `naming.convention.lint`) which uses dedicated Site OS lint commands in `site-kernel-checks`. ESLint also requires AST analysis of import paths, which is more fragile than file-level whitelist checking.

3. **Keep `commitAndPushBordbuch` exported**: Allow callers to use either `appendAndCommitBordbuch` or the separate `appendBordbuchEntry` + `commitAndPushBordbuch` pattern. Rejected — no legacy code, no backward compatibility. Keeping the export invites future gaps.

4. **Throw on commit failure in the helper**: Make `appendAndCommitBordbuch` throw when `commitSha` is null or `pushed` is false. Rejected — commands like `release.rollback` and `leitstand.rollback` have already performed state transitions before the bordbuch append. Throwing after that leaves the system in an inconsistent state. The helper returns the result; each caller decides whether to throw (mission.open does, nachweis commands don't).

## Risks

- **Lock reentrancy**: The helper acquires `bordbuch:${systemId}` lock. If the caller already holds this lock (e.g., nachweis commands acquire it before append), the lock is reentrant for the same PID — depth is incremented, not deadlocked. Verified in `packages/forge/src/tests/werkstatt-lock.test.ts:128` ("is re-entrant for same PID").
- **Push failure on new Sternsystems**: `sternsystem.extract` creates a new cache clone that may not have a git remote configured yet. `commitAndPushBordbuch` will commit locally but fail to push. The helper returns `{ pushed: false }` — `sternsystem.extract` does not check this, which is correct (push will happen on the next operation).
- **Lint false positives**: The whitelist is file-path-based. If a file is renamed or a new file needs direct `appendBordbuchEntry` access, the lint will flag it. This is intentional — it forces a conscious decision to add the file to the whitelist.
- **Agent misinterpretation**: Agents may try to call `appendBordbuchEntry` directly in new commands. The lint catches this at build time, but agents may be confused if they haven't read this RFC. The `AGENTS.md` update for `packages/os/site-kernel-handoff` should document the helper as the canonical API.
- **Performance**: The helper adds one `git add` + `git commit` + `git push` per bordbuch append. This is the same cost as the existing 4 commands that already do this. No additional overhead beyond closing the gap for the 16 commands that were skipping it.
- **Concurrent execution**: Two commands running simultaneously for the same systemId (e.g. `nachweis.ingest` and `mission.migrate`) both acquire the `bordbuch:${systemId}` lock, which serializes append operations. After releasing the lock, `commitAndPushBordbuch` may interleave — `git add bordbuch/events.ndjson` stages all dirty lines regardless of which command appended them. This is safe: the commit captures all pending entries, and the push is idempotent for already-pushed commits.

## Acceptance criteria

- [x] `appendAndCommitBordbuch` and `appendBatchAndCommitBordbuch` defined in `bordbuch/bordbuch-commit-helper.ts` with correct TypeScript types (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.ts)
- [x] `commitAndPushBordbuch` removed from `bordbuch/index.ts` barrel exports — internal only (evidence: packages/os/site-kernel-handoff/src/bordbuch/index.ts)
- [x] All 20 commands migrated to use `appendAndCommitBordbuch` or `appendBatchAndCommitBordbuch` — no direct `appendBordbuchEntry` calls outside whitelist (evidence: bordbuch.commit.parity.lint passes with 0 violations)
- [x] `bordbuch.commit.parity.lint` command registered in `site-kernel-checks` and integrated into `PACKAGES_CHECK_PIPELINE` (evidence: packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts, packages/os/site-kernel-checks/src/pipelines/packages-check.ts)
- [x] `bordbuch/events.ndjson` added to `BORDBUCH_PROJECTION_PATHS` in `bordbuch-commit.ts` (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts)
- [x] `bordbuch.commit.parity.lint` passes with zero violations after migration (evidence: site-kernel run bordbuch.commit.parity.lint --mode fail → 0 error(s), 0 warning(s))
- [x] `AGENTS.md` for `packages/os/site-kernel-handoff` updated with `appendAndCommitBordbuch` as canonical API (evidence: packages/os/site-kernel-handoff/AGENTS.md)
- [x] Unit tests verify helper appends + commits + pushes in one call (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.test.ts)
- [x] Unit tests verify `appendBatchAndCommitBordbuch` commits once for multiple entries (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.test.ts)
- [x] `rfc.validate` passes on this file before merging (evidence: this validation run)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST use `appendAndCommitBordbuch` or `appendBatchAndCommitBordbuch` for all new bordbuch entries. Direct `appendBordbuchEntry` calls are only permitted in the 3 whitelist files.
- Agents MUST NOT re-export `commitAndPushBordbuch` from barrel files — it is internal to `bordbuch-io.ts`.
- `mission.open` and `mission.close` MUST continue to verify push success (ADR-0030) by checking `commitResult.commitSha` and `commitResult.pushed` on the returned `AppendAndCommitResult`.
