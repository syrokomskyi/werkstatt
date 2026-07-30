---
id: RFC-0593
title: "Add validation gates to mission lifecycle: bordbuch.validate before mission.open and mission.validate before mission.close"
status: accepted
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
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
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
  - DNA-47
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
successSignals:
  - "Zero missions closed with invalid content after gate implementation"
  - "bordbuch.repair triggered proactively at mission.open, not reactively after close"
nonGoals:
  - "Does not add a validation gate to mission.abort — aborted missions discard the workpiece, so content validity is irrelevant"
  - "Does not add a validation gate to release.prepare — release.prepare already runs its own validation (behavior snapshot diff, migrator validation, bordbuch consistency per DNA-48)"
  - "Does not cache mission.validate results — each mission.close runs a fresh validation"
  - "Does not add a --force bypass flag — validation gates are hard gates, not warnings"
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
- **RFC-0355** — the original mission lifecycle RFC. This RFC extends the `mission.open` and `mission.close` behavior with validation gates. RFC-0355 is archived (implemented); this RFC does not amend the archived document but adds new enforcement behavior to the commands it established.
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
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Add `runInlineValidate` call after `reconciledAt` check, before `acquireLock` — validation runs outside the lock scope to avoid holding registry/system/mission locks for 2+ minutes. State is re-checked inside the lock before transition. |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | `validateBordbuch` already exported — `mission.open` calls it directly |
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

### Invariant chain: reconciledAt implies materializedAt

`mission.close` currently checks `reconciledAt !== null` but not `materializedAt`. This RFC adds `mission.validate` as a gate, which requires `materializedAt`. The edge case of a non-materialized mission reaching close is impossible by construction:

1. `mission.reconcile` requires `evidence/validation-report.json` to exist (`mission-materialization-commands.ts:614`).
2. `validation-report.json` is created by `mission.validate`, which requires `manifest.materializedAt` (`mission-materialization-commands.ts:159`).
3. Therefore `reconciledAt !== null` → `validation-report.json` exists → `mission.validate` ran → `materializedAt !== null`.

The inline `mission.validate` in `mission.close` inherits this precondition: if `reconciledAt` is set, `materializedAt` is guaranteed to be set. No exception path is needed for non-materialized missions.

### Lock scope design

`mission.validate` runs `build.prepare` + `build.check` + `astro build` (2+ minutes). Running this inside the registry/system/mission locks would block all other operations on the same Sternsystem for the duration. Instead, `mission.close` runs `runInlineValidate` **before** `acquireLock` (after the `reconciledAt` check, which is also before locks). After validation passes, `mission.close` acquires the locks and re-checks `manifest.state === "open"` inside the lock before transitioning. If another process closed/aborted the mission between validation and lock acquisition, the re-check fails and `mission.close` exits with a state error.

The workpiece is only accessible to the current mission (single-open-mission constraint, DNA-46), so concurrent modification of the workpiece between validation and lock acquisition is not a concern.

### TOCTOU for preflightBordbuch in mission.open

`preflightBordbuch` runs before lock acquisition in `mission.open`. This means bordbuch validation happens without holding any lock. If `bordbuch.repair` (RFC-0583) runs concurrently (operator-only, uses its own `system:<id>` and `bordbuch:<id>` lock scopes), the bordbuch could change between validation and lock acquisition. This is a known limitation with low risk: `bordbuch.repair` is operator-only and rarely used. The race window is small (between `validateBordbuch` return and `acquireLock` call). If the bordbuch is repaired between validation and lock acquisition, the next `mission.open` will pass — the failed attempt exits with code 1 before any side effects.

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
- **Double build**: the standard flow is `mission.validate` (build) → `mission.reconcile` → `mission.close` (which calls `mission.validate` again → second build). The first build is the manual `mission.validate` required by `mission.reconcile`; the second is the inline gate in `mission.close`. This is a double build, not triple — `mission.reconcile` does not build. The second build confirms nothing changed between the manual validate and close. This is acceptable for a rare operation (once per mission).

## Acceptance criteria

- [x] `mission.open` calls `bordbuch.validate` before creating directories or writing the manifest (evidence: packages/os/site-kernel-handoff/src/mission/mission-open.ts:83-96, preflightBordbuch runs before acquireLock and createMissionDirectories at line 124)
- [x] `mission.open` exits with code 1 and a descriptive error when bordbuch has violations (evidence: packages/os/site-kernel-handoff/src/mission/mission-open.ts:88-96, mission-open-bordbuch-gate.test.ts:92-97)
- [x] `mission.open` does not create any side effects (no directories, no manifest, no registry update) when bordbuch validation fails (evidence: mission-open-bordbuch-gate.test.ts:98-100, preflightBordbuch runs before acquireLock and createMissionDirectories)
- [x] `mission.close` calls `mission.validate` after the `reconciledAt` check and before state transition (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:145-154, runInlineValidate called after reconciledAt check at line 139, before acquireLock at line 156)
- [x] `mission.close` exits with code 1 and a descriptive error when validation fails (evidence: mission-close-validate-gate.test.ts:117-125, throws with failure list)
- [x] `mission.close` does not transition the mission to `closed` state when validation fails (evidence: mission-close-validate-gate.test.ts:127-130, manifest.state remains "open" after failed validation)
- [x] `mission.close` error output includes the list of failed validators with file references (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:98-110, lists validator names + exit codes + evidence/validation-report.json reference)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` updated with the new gate behavior in the mission lifecycle section (Bordbuch git synchronization / Werkstatt side-effect auto-commit sections) (evidence: packages/os/site-kernel-handoff/AGENTS.md:118-124, "Validation gates (RFC-0593)" section)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` documents the invariant chain: `reconciledAt` implies `materializedAt` via the validate → reconcile → close flow (evidence: packages/os/site-kernel-handoff/AGENTS.md:122, "Invariant chain" bullet point)
- [x] Unit tests cover both gates (bordbuch violation blocks open, validation failure blocks close) (evidence: mission-open-bordbuch-gate.test.ts, mission-close-validate-gate.test.ts)
- [x] Unit test verifies `mission.close` re-checks state inside lock after out-of-lock validation (evidence: mission-close-validate-gate.test.ts:140-170, "state changed to 'aborted' during validation" test)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0593 --json → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add a `--force` flag to bypass validation gates. Hard gates only.
- Agents MUST NOT move the `bordbuch.validate` call after directory creation — it must run before any side effects.
- Agents MUST NOT cache `mission.validate` results inside `mission.close` — the validate must run fresh every time.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
