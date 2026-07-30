---
id: RFC-0593
title: "Add validation gates to mission lifecycle: bordbuch.validate before mission.open and mission.validate before mission.close"
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
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-47
  - RFC-0355
  - RFC-0583
  - RFC-0517
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
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
    - mission.open
    - mission.close
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/ontology"
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

# RFC-0593: Add validation gates to mission lifecycle: bordbuch.validate before mission.open and mission.validate before mission.close

## Context

During mission `warpgogol-com-m000021` (German translation), the translation session committed 10 commits without ever running `mission.validate`. Three classes of errors reached the close phase undetected:

1. **PBP schema violation** — `description` field used instead of `summary` in 10 offering files (5 DE + 5 UK). Caught by `pbp.content.validate` inside `mission.validate`, but only when the release session ran it.
2. **metaDescription length** — 3 German pages exceeded the 160-character limit by 1–3 characters. Caught by `semantic.drift.validate`.
3. **Stale behavior snapshot** — behavior snapshot was not regenerated after content changes. Caught by `behavior.snapshot.validate` (SNAP-01).

Additionally, `bordbuch.validate` reported an `orphan-mission-close` for the previous mission (`m000020`) — a broken bordbuch that existed before the session started. `mission.open` did not detect this, so the new mission was opened on top of a broken bordbuch.

The current `mission.close` only checks `reconciledAt !== null` — it does not validate content. An operator or agent can close a mission with invalid content, which then fails at `release.prepare` or later.

## Problem

Two gaps in the mission lifecycle allow invalid state to progress undetected:

1. **`mission.open` does not validate bordbuch integrity.** A broken bordbuch (e.g., `orphan-mission-close` from a previous mission) is inherited silently. The new mission's bordbuch entries are appended to an already-broken hash chain, compounding the damage. `bordbuch.repair` (RFC-0583) exists but is reactive — it can only be run after the problem is discovered.

2. **`mission.close` does not validate content.** The `reconciledAt` guard ensures the workpiece was merged into the cache clone, but does not verify that the content is valid. An operator or agent can reconcile and close a mission with schema violations, stale snapshots, or SEO drift. These errors surface later — at `release.prepare` or `release.publish` — requiring a new mission to fix.

Both gaps rely on manual discipline: the operator must remember to run `mission.validate` before `mission.close` and `bordbuch.validate` before `mission.open`. There is no automated gate.

## Decision

`mission.open` runs `bordbuch.validate` as a pre-flight gate: if the Sternsystem's bordbuch has any violation, `mission.open` refuses to open a new mission and directs the operator to run `bordbuch.repair` first. `mission.close` runs `mission.validate` inline before transitioning to `closed` state: if validation fails (any validator or build step), `mission.close` refuses to close the mission and reports the failures.

## Architectural fit

- **DNA-46 (Mission lifecycle)** — extends the mission lifecycle enforcement chain. Currently `mission.close` checks `reconciledAt`; this RFC adds content validation as a second gate. `mission.open` gains a bordbuch integrity gate.
- **DNA-47 (Materialization)** — `mission.validate` is already part of the materialization flow. This RFC makes it mandatory before close, not optional.
- **RFC-0355** — the original mission lifecycle RFC. This RFC amends the `mission.open` and `mission.close` behavior.
- **RFC-0583** — `bordbuch.repair` exists as a disaster-recovery tool. The `mission.open` gate makes it proactive: the operator is forced to repair before opening a new mission.
- **RFC-0517** — pre-materialize content quality gate. This RFC extends the same principle to the close phase.

## Design

### CLI surface

No new commands. Two existing commands gain pre-flight gates:

```sh
# mission.open — now runs bordbuch.validate first
pnpm exec site-kernel run mission.open --system warpgogol-com --brief "..."
# If bordbuch.validate fails:
#   [ERROR] [mission.open] bordbuch for system 'warpgogol-com' has 1 violation(s) — run bordbuch.repair first
#   [ERROR]   orphan-mission-close: mission 'warpgogol-com-m000020' has close without open

# mission.close — now runs mission.validate first
pnpm exec site-kernel run mission.close --mission warpgogol-com-m000021
# If mission.validate fails:
#   [ERROR] [mission.close] validation failed for mission 'warpgogol-com-m000021' — fix issues and re-run mission.validate
#   [ERROR]   pbp.content.validate: 10 file(s) with schema violations
#   [ERROR]   semantic.drift.validate: 3 page(s) with metaDescription > 160 chars
```

### TypeScript contracts

```ts
// mission-open.ts — new pre-flight gate
async function preflightBordbuch(
  workspaceRoot: string,
  systemId: string,
): Promise<{ passed: boolean; violations: BordbuchViolation[] }>

// mission-close.ts — new inline validation gate
async function runInlineValidate(
  workspaceRoot: string,
  missionId: string,
  context: KernelRuntimeContext,
): Promise<{ passed: boolean; failures: string[]; report: MissionValidateData }>
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-open.ts` | Add `preflightBordbuch` call before lock acquisition |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Add `runInlineValidate` call after `reconciledAt` check, before lock release |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | Export `runBordbuchValidate` for reuse (already exists as internal) |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `runMissionValidate` already exists — `mission.close` calls it directly |

### Output format

```json
{
  "command": "mission.close",
  "exitCode": 1,
  "data": null,
  "summary": "[mission.close] validation failed for mission 'warpgogol-com-m000021' — fix issues and re-run mission.validate",
  "validationReport": {
    "passed": false,
    "failures": [
      "pbp.content.validate: 10 file(s) with schema violations",
      "semantic.drift.validate: 3 page(s) with metaDescription > 160 chars"
    ]
  }
}
```

### Failure modes

- **bordbuch.validate fails in mission.open**: `mission.open` exits with code 1 before creating any directories or writing the manifest. No side effects. The error message names the violation type and directs to `bordbuch.repair`.
- **mission.validate fails in mission.close**: `mission.close` exits with code 1 before transitioning state. The mission remains `open`. The error message lists all failed validators with file references. The operator fixes the issues, commits via `mission.git.commit`, re-runs `mission.validate` to confirm, then re-runs `mission.close`.
- **mission.validate build step fails**: Same behavior — `mission.close` refuses. The build failure is reported with the same structured diagnostics as `mission.validate` (RFC-0578).
- **`--force` flag**: NOT provided. Validation gates are hard gates, not warnings. Bypassing validation requires a code change, not a flag.

## Rollout

- **Default behavior**: fail-hard from day one. Both gates are mandatory — no opt-in, no grace period.
- **Existing systems**: all Sternsystemen with valid bordbuch and no open missions are unaffected. Systems with bordbuch violations will be blocked at `mission.open` until `bordbuch.repair` is run.
- **New systems**: automatically compliant — `mission.open` validates bordbuch (empty bordbuch on first mission passes), `mission.close` validates content.
- **Pipeline integration**: no pipeline changes. The gates run inside `mission.open` and `mission.close` themselves, not in `build.check`.
- **Migration path**: none required. The gates are additive — they add checks, not remove existing ones.

## Alternatives considered

1. **Check `validatedAt` in mission manifest** — `mission.validate` would write `validatedAt` and `validationVerdict` to `mission.yaml`; `mission.close` would check their presence. Rejected: does not guarantee freshness. An operator could validate, then edit files, then close. Running `mission.validate` inline inside `mission.close` guarantees the validation reflects the current workpiece state.

2. **Warn-only mode** — `mission.close` would warn but not block on validation failures. Rejected: warnings are easily ignored by agents and operators. The goal is to make it impossible to close an invalid mission.

3. **`--force` bypass flag** — allow `mission.close --force` to skip validation. Rejected: defeats the purpose. If validation is optional, it will be skipped under time pressure. Hard gates only.

## Risks

- **Performance**: `mission.close` now runs a full build+validate (2+ minutes). This is acceptable — close is a rare operation (once per mission), and the alternative (closing with invalid content) is more expensive.
- **False positives**: if a validator has a bug, `mission.close` will block legitimate closures. Mitigation: validators are already tested; a validator bug would also block `mission.validate` independently.
- **Agent confusion**: agents may try to bypass the gate by editing `mission.yaml` directly. Mitigation: `mission.yaml` is a generated file (RFC-0580 auto-commit), and direct edits are already discouraged by AGENTS.md.
- **Double build**: if the operator runs `mission.validate` manually and then `mission.close`, the build runs twice. This is acceptable — the second build confirms nothing changed between validate and close.

## Acceptance criteria

- [ ] `mission.open` calls `bordbuch.validate` before creating directories or writing the manifest
- [ ] `mission.open` exits with code 1 and a descriptive error when bordbuch has violations
- [ ] `mission.open` does not create any side effects (no directories, no manifest, no registry update) when bordbuch validation fails
- [ ] `mission.close` calls `mission.validate` after the `reconciledAt` check and before state transition
- [ ] `mission.close` exits with code 1 and a descriptive error when validation fails
- [ ] `mission.close` does not transition the mission to `closed` state when validation fails
- [ ] `mission.close` error output includes the list of failed validators with file references
- [ ] `AGENTS.md` updated with the new gate behavior in the mission lifecycle section
- [ ] Unit tests cover both gates (bordbuch violation blocks open, validation failure blocks close)
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add a `--force` flag to bypass validation gates. Hard gates only.
- Agents MUST NOT move the `bordbuch.validate` call after directory creation — it must run before any side effects.
- Agents MUST NOT cache `mission.validate` results inside `mission.close` — the validate must run fresh every time.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
