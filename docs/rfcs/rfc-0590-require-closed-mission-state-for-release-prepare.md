---
id: RFC-0590
title: "Require closed mission state for release.prepare"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
implementedAt: 2026-07-29
closedAt:
supersedes:
supersededBy:
amends:
  - RFC-0357
  - RFC-0522
amendedBy: []
related:
  - DNA-48
  - DNA-46
  - RFC-0355
  - RFC-0585
  - RFC-0522
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
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
    - release.prepare
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "release.prepare refuses open missions with a clear error message"
  - "release.prepare accepts closed missions and completes the build pipeline"
  - "No existing release workflow breaks because all prior releases used closed missions"
  - "mission.close missing-release-id warning reflects the reversed workflow (release.prepare runs after close)"
nonGoals:
  - "This RFC does not change release.publish (already requires closed mission per RFC-0357)"
  - "This RFC does not add a dry-run or review mode for pre-close validation"
  - "This RFC does not change mission.close preconditions"
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

# RFC-0590: Require closed mission state for release.prepare

## Context

RFC-0357 established the release discipline contract, including the state transition table for releases. The transition from `(none)` to `prepared` via `release.prepare` currently allows missions in either `open` or `closed` state:

> `release.prepare` — Mission is `closed` (or `open` with validation passed — `release.prepare` can run before `mission.close` to allow review). Behavior snapshot diff passes.

This allowance was designed to let operators review a release candidate before finalizing the mission. In practice, it introduces a class of risks: `release.prepare` on an open mission can build from a dirty or unvalidated workpiece, bypass the reconcile gate, and produce a release artifact from content that has not passed the full mission close validation.

RFC-0522 added a `missing-release-id` warning to `mission.close` when `releaseId` is null, with the message "Run `release.prepare` before close to associate a release." This warning assumed the old workflow where `release.prepare` runs on an open mission before `mission.close`. Tightening `release.prepare` to require `state: closed` reverses the workflow: `mission.close` now runs first, then `release.prepare` on the closed mission. The RFC-0522 warning must be reworded to reflect the new order.

The mission lifecycle (DNA-46) and release discipline (DNA-48) are separate cycles by design. `mission.close` is the validation gate that finalizes the workpiece (reconcile, bordbuch close entry, registry cleanup). `release.prepare` is the build gate that produces an immutable artifact. Allowing the build gate to run before the validation gate undermines the separation of concerns.

## Problem

`release.prepare` in `packages/os/site-kernel-handoff/src/release/release-commands.ts:145` accepts both `open` and `closed` mission states:

```ts
if (manifest.state !== "open" && manifest.state !== "closed") {
  throw new Error(
    `[release.prepare] mission '${missionId}' is not open or closed (state: ${manifest.state})`,
  );
}
```

This means a release can be prepared from a mission that:

- Has not been reconciled (`reconciledAt` is null)
- Has a dirty workpiece with uncommitted changes
- Has no bordbuch close entry (audit trail incomplete)
- Has `currentMission` still set in `registry.yaml` (active editing surface)

The `mission.close` guard (RFC-0480) refuses to close a mission with null `reconciledAt`, but `release.prepare` does not enforce this. An operator could run `release.prepare` on an open mission, produce a release artifact, and then `mission.close` could fail — leaving a release without a closed mission.

## Decision

`release.prepare` accepts only missions with `state === "closed"`. Missions in `open` state are refused with a clear error message directing the operator to run `mission.close` first. This amends the RFC-0357 transition table entry that allowed `open` missions. It also amends RFC-0522's `missing-release-id` warning in `mission.close` to reflect the reversed workflow (release.prepare runs after close, not before).

## Architectural fit

- **DNA-46 (Mission lifecycle):** Enforces the separation between mission lifecycle and release lifecycle. `mission.close` is the gate that finalizes the workpiece; `release.prepare` builds from the finalized artifact.
- **DNA-48 (Release discipline):** Tightens the release contract. A release is now always produced from a validated, reconciled, and closed mission — never from an active editing surface.
- **RFC-0355 (Mission lifecycle and Bordbuch):** Aligns with the bordbuch close entry requirement. A release from a closed mission guarantees the bordbuch audit trail is complete.
- **RFC-0522 (releaseId tracking):** The `missing-release-id` warning in `mission.close` assumed `release.prepare` runs before close. This RFC amends RFC-0522 by rewording the warning to direct operators to run `release.prepare` after close instead.
- **RFC-0585 (Restore release.prepare production build):** Compatible — RFC-0585 restored the production build in `release.prepare`; this RFC constrains when `release.prepare` may run, not how it builds.

### Invariant chain: closed implies reconciled

A mission with `state: closed` always has `reconciledAt` set to a non-null value because `mission.close` enforces this as a hard guard (per `packages/os/site-kernel-handoff/AGENTS.md` and RFC-0480). This means `release.prepare`'s `state === "closed"` check transitively guarantees the mission has been reconciled — no separate `reconciledAt` check is needed in `release.prepare`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run release.prepare --mission <mission-id>
```

No new flags. The `--mission` flag is already required. The only change is the state check: `open` missions are refused.

Error message for open missions:

```
[release.prepare] mission '<mission-id>' is not closed (state: open). Run `mission.close --mission <mission-id>` first.
```

### TypeScript contracts

The state check change is a single-line condition update in `release-commands.ts`:

```ts
// Before (RFC-0357):
if (manifest.state !== "open" && manifest.state !== "closed") {
  throw new Error(
    `[release.prepare] mission '${missionId}' is not open or closed (state: ${manifest.state})`,
  );
}

// After (RFC-0590):
if (manifest.state !== "closed") {
  throw new Error(
    `[release.prepare] mission '${missionId}' is not closed (state: ${manifest.state}). Run \`mission.close --mission ${missionId}\` first.`,
  );
}
```

The `mission.close` warning change is a single-line message update in `mission-close.ts`:

```ts
// Before (RFC-0522):
"Mission closed without release — releaseId is null. Run release.prepare before close to associate a release."

// After (RFC-0590):
"Mission closed without release — releaseId is null. Run release.prepare after close to associate a release."
```

No new types or interfaces are introduced.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | State check updated (line ~145) |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | `missing-release-id` warning message reworded (line ~258) |
| `packages/os/site-kernel-handoff/AGENTS.md` | Document closed-mission requirement for `release.prepare` |
| `missions/<id>/mission.yaml` | Read to check `state` field |

No files are created or deleted. No generated files need regeneration.

### Output format

No `--json` output shape changes. The command fails fast with a non-zero exit code and the error message shown in the CLI surface section. On success, the output is unchanged from RFC-0585.

### Failure modes

- **Open mission:** `release.prepare` exits non-zero with a message directing the operator to `mission.close`. This is a hard refusal, not a warning.
- **Aborted mission:** Already refused by the current code (state is neither `open` nor `closed`). This does not change.
- **Non-existent mission:** Already refused by `readMissionManifest`. This does not change.

## Rollout

- **Default behavior:** Fail-hard from the first release after acceptance. No grace period, no `--strict` flag.
- **Existing apps:** No migration needed. All prior releases were prepared from closed missions in practice (the `open` path was rarely used). No existing release artifacts are invalidated.
- **New apps:** Automatically comply — `release.prepare` refuses open missions from day one.
- **Deprecation path:** RFC-0357's transition table entry for `open` missions is amended. The note "`release.prepare` MAY run before `mission.close`" is removed. RFC-0522's `missing-release-id` warning is reworded to direct operators to run `release.prepare` after close.
- **Pipeline integration:** No pipeline changes. `release.prepare` is a standalone command, not part of `build.prepare` or `build.check`.

## Alternatives considered

1. **Add a `release.dry-run` command for pre-close review.** Rejected — adds complexity to the command surface for a use case that `mission.build` already covers. `mission.build` runs the same build pipeline (`build.prepare` → `astro build` → `build.post`) and produces a `dist/` for review without creating a release artifact.

2. **Keep `open` allowed but add a `reconciledAt` guard.** Rejected — duplicates the `mission.close` guard. `mission.close` already refuses to close without `reconciledAt`. Adding the same check to `release.prepare` is redundant if the mission must be closed first.

3. **Warn but allow `open` missions.** Rejected — warnings are easily ignored by agents and operators. A hard refusal is the only reliable enforcement for a contract tightening.

## Risks

- **Operator workflow change:** Operators who previously ran `release.prepare` on open missions for review must now use `mission.build` instead. This is a minor workflow change documented in the error message.
- **Agent misinterpretation:** Agents may attempt `release.prepare` on open missions and hit the refusal. The error message explicitly directs to `mission.close`, so the agent should follow the guidance.
- **False positive rate:** Zero — the check is a simple state comparison. No heuristic, no ambiguity.
- **Maintenance burden:** Minimal — one line of code, one error message.

## Acceptance criteria

- [x] `release.prepare` refuses missions with `state: "open"` and exits non-zero (evidence: packages/os/site-kernel-handoff/src/release/release-commands.ts:145-149, `manifest.state !== "closed"` throws)
- [x] Error message includes the mission id, current state, and directs to `mission.close` (evidence: packages/os/site-kernel-handoff/src/release/release-commands.ts:147, message contains missionId, state, and `mission.close --mission`)
- [x] `release.prepare` accepts missions with `state: "closed"` and completes the build pipeline (evidence: packages/os/site-kernel-handoff/src/release/release-commands.ts:145, `state === "closed"` passes the check; pnpm --filter @warpgogol/site-kernel-handoff test — 354 tests pass)
- [x] `mission.close` `missing-release-id` warning says "after close" instead of "before close" (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:258, test mission-close-release-id-warning.test.ts:41,55)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` documents the closed-mission requirement for `release.prepare` (evidence: packages/os/site-kernel-handoff/AGENTS.md:93)
- [x] `rfc.validate` passes on this RFC file (evidence: `pnpm exec site-kernel run rfc.validate` — zero errors for RFC-0590)
- [x] RFC-0357 frontmatter `amendedBy` includes RFC-0590 (evidence: docs/rfcs/archive/implemented/rfc-0357-release-discipline-and-behavior-snapshot-diff-gating.md:24)
- [x] RFC-0522 frontmatter `amendedBy` includes RFC-0590 (evidence: docs/rfcs/archive/implemented/rfc-0522-reconcile-dirty-cache-clone-guard-3way-fallback-and-release-id-tracking.md:22)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The implementation is a two-line change: one in `packages/os/site-kernel-handoff/src/release/release-commands.ts` (state check, line ~145) and one in `packages/os/site-kernel-handoff/src/mission/mission-close.ts` (warning message, line ~258).
- Agents MUST NOT add a `--force` flag to bypass the closed-mission check.
- Agents MUST NOT add a `release.dry-run` command as part of this RFC — that is explicitly a non-goal.
- If an operator asks to prepare a release from an open mission, agents MUST direct them to `mission.close` first, not attempt to bypass the check.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
