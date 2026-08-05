---
id: RFC-0702
title: "Auto-commit bordbuch status.generated.yaml after mission.validate"
status: draft
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
reviewers: []
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0477
  - RFC-0584
  - RFC-0597
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
  changed:
    - mission.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals: []
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

# RFC-0702: Auto-commit bordbuch status.generated.yaml after mission.validate

## Context

`mission.validate` runs validation checks on a mission workpiece and generates `bordbuch/status.generated.yaml` as a side effect. The AGENTS.md rule (RFC-0477) states: _"`commitAndPushBordbuch` must commit `bordbuch/status.generated.yaml` alongside `bordbuch/events.ndjson`"_. However, `mission.validate` does not call `commitAndPushBordbuch` — it generates the status file but leaves it uncommitted in the cache clone.

This causes `mission.validate` to emit a warning: `cache clone has 1 uncommitted file(s)` — specifically `bordbuch/status.generated.yaml`. The next `mission.reconcile` then encounters a dirty cache clone, which can trigger bordbuch conflict auto-resolution (RFC-0584) or block reconciliation.

## Problem

`bordbuch/status.generated.yaml` is generated during `mission.validate` but not committed to the cache clone. This leaves the cache clone dirty, causing warnings and potential conflicts during `mission.reconcile`. Operators must manually run `bordbuch.commit` after `mission.validate` to clean up, which is easily forgotten.

The gap is in `packages/os/site-kernel-handoff/src/mission/mission-validate.ts` — the command generates the status file but does not commit it.

## Decision

`mission.validate` auto-commits `bordbuch/status.generated.yaml` to the cache clone after generating it, using the existing `commitAndPushBordbuch` helper.

- The commit includes both `bordbuch/events.ndjson` (if modified) and `bordbuch/status.generated.yaml`.
- The commit is non-fatal: if the commit fails (e.g. git lock conflict), `mission.validate` logs a warning and continues — validation results are not affected.
- The push is best-effort: if the push fails (e.g. network issue), a warning is logged.

## Architectural fit

- **RFC-0477**: aligns with the existing AGENTS.md rule that `commitAndPushBordbuch` must commit `status.generated.yaml` alongside `events.ndjson`.
- **RFC-0584**: reduces bordbuch conflict auto-resolution triggers by keeping the cache clone clean after validation.
- **RFC-0597**: `mission.close` already commits `.materialization-state.json` after writing it. This RFC applies the same pattern to `mission.validate` for `status.generated.yaml`.
- **Site OS operator model**: `mission.validate` is a read-only validation command, but it generates status files as a side effect. Committing those side effects keeps the cache clone clean without requiring a separate manual step.

## Design

### CLI surface

No CLI surface changes. The command flags remain the same:

```sh
pnpm exec site-kernel run mission.validate --system warpgogol-com
```

### TypeScript contracts

No new types. The existing `commitAndPushBordbuch` function from `packages/os/site-kernel-handoff/src/bordbuch/` is called after status file generation.

```ts
// In mission-validate.ts, after bordbuch.generate:
try {
  await commitAndPushBordbuch(cacheCloneDir, systemId, {
    message: `mission.validate: update bordbuch status for ${missionId}`,
    push: true,
  });
} catch (err) {
  logger.warn(`mission.validate: bordbuch commit failed (non-fatal) — ${msg}`);
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/workpiece/bordbuch/status.generated.yaml` | Generated by `bordbuch.generate`, committed by this RFC |
| `missions/<id>/workpiece/bordbuch/events.ndjson` | Committed alongside status file if modified |
| Cache clone `bordbuch/` directory | Git add + commit target |

### Output format

No output format changes. The `--json` output remains the same. A new `bordbuchCommitted: boolean` field is added to indicate whether the commit succeeded.

```json
{
  "command": "mission.validate",
  "status": "pass",
  "bordbuchCommitted": true,
  "...": "..."
}
```

### Failure modes

- `bordbuch.generate` fails: existing behavior (validation continues without status file).
- `commitAndPushBordbuch` commit fails: **warning** — validation results are not affected. `bordbuchCommitted: false`.
- `commitAndPushBordbuch` push fails: **warning** — commit succeeded but push did not. `bordbuchCommitted: true` (commit succeeded), push error logged.
- Validation itself fails: existing behavior (exit 1 with violations). Bordbuch commit still runs before returning.

## Rollout

- **Default behavior**: auto-commit is the new default. No opt-in flag needed.
- **Existing apps**: no changes needed. The behavior change is backward-compatible — the only observable difference is that `mission.validate` no longer leaves `status.generated.yaml` uncommitted.
- **No migration path needed**: the change is additive — a new commit step after existing validation logic.
- **Pipeline integration**: `mission.validate` is called during `leitstand.dev-deploy` and as a standalone command. Both paths benefit from the auto-commit.

## Alternatives considered

- **Call `bordbuch.commit` as a separate pipeline step after `mission.validate`**: rejected — requires changing every caller of `mission.validate` to add the commit step. The auto-commit inside `mission.validate` is simpler and guarantees the cleanup always happens.
- **Make `bordbuch.generate` commit automatically**: rejected — `bordbuch.generate` is a standalone command that may be called in contexts where a commit is not desired (e.g. dry-run, report-only). The commit belongs in `mission.validate`, which is the validation context.
- **Suppress the dirty-cache warning instead of committing**: rejected — the warning exists because the dirty state is a real problem for `mission.reconcile`. Suppressing the warning hides the issue without fixing it.

## Risks

- **Git lock conflict**: if another process holds the git lock in the cache clone, the commit will fail. Mitigation: non-fatal warning, validation results are not affected.
- **Extra commits in bordbuch history**: each `mission.validate` run adds a commit. This is acceptable — the bordbuch is an append-only event log, and status updates are meaningful events.
- **Agent confusion**: agents might expect `mission.validate` to be purely read-only. Mitigation: the `bordbuchCommitted` field in the output makes the side effect visible.

## Acceptance criteria

- [ ] `mission.validate` calls `commitAndPushBordbuch` after generating `status.generated.yaml`
- [ ] Commit includes both `events.ndjson` (if modified) and `status.generated.yaml`
- [ ] Commit failure is non-fatal (warning logged, validation continues)
- [ ] Push failure is non-fatal (warning logged, commit retained)
- [ ] `--json` output includes `bordbuchCommitted` field
- [ ] Cache clone is clean after `mission.validate` completes successfully
- [ ] Unit test covers the auto-commit path in `mission-validate.ts`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT make the bordbuch commit fatal — validation results must always be returned regardless of commit success.
- Agents MUST NOT skip the commit when `status.generated.yaml` is unchanged — `commitAndPushBordbuch` should handle the no-op case (no changes to commit).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0702 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
