---
id: ADR-0002
title: "Dirty workpiece guards for mission lifecycle commands"
status: implemented
scope: package
decider: architecture
createdAt: 2026-07-22
updatedAt: 2026-07-22
implementedAt: 2026-07-22
supersedes: []
supersededBy:
related:
  - RFC-0480
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0002: Dirty workpiece guards for mission lifecycle commands

## Context

RFC-0480 introduced git-backed mission workpieces with step-by-step commits. `mission.reconcile` transfers commits via `git format-patch` + `git am`, and `mission.close`/`mission.abort` create git bundles for audit trails. However, no guard checked whether the workpiece was clean (no uncommitted changes) before these operations. Uncommitted changes would be silently lost during reconcile (not included in patch series) and absent from git bundles.

In practice, agents across multiple sessions edited workpiece content but did not always commit. Generated artifacts (agent.json, llms.txt, entitlements.generated.yaml) also accumulated as dirty files after validation runs. This led to data loss during reconcile and incomplete audit trails.

## Decision

Add dirty workpiece checks to mission lifecycle commands with severity proportional to the operation's criticality.

- **`mission.reconcile`** — hard block. Refuses to proceed if workpiece has uncommitted changes. Error message directs operator to `mission.git.commit`.
- **`mission.close`** — hard block. Refuses to proceed if workpiece has uncommitted changes. Error message directs operator to `mission.git.commit`.
- **`mission.validate`** — non-blocking warning. After validation completes, logs a warning with file count and `git status` hint if workpiece is dirty.
- **`mission.abort`** — non-blocking warning. Logs that uncommitted files will not be included in the git bundle, but proceeds with abort.

Shared helper `isWorkpieceDirty()` in `mission-git-commit.ts` provides the dirty check logic (`git status --porcelain`).

## Justification

- Reconcile and close are points of no return — uncommitted changes are irrecoverably lost. Blocking is the only safe option.
- Validate is a repeatable working tool — blocking would create a commit-validate-dirty cycle. Warning is sufficient.
- Abort is an emergency operation — blocking could trap the operator. Warning preserves awareness without blocking.
- The `isWorkpieceDirty()` helper is colocated with `mission.git.commit` (the canonical commit command) since both operate on workpiece git state.

## Consequences

- **Positive:** No silent data loss during reconcile. Complete audit trails in git bundles. Agents are reminded to commit after validation.
- **Negative:** Operators must commit before reconcile/close — an extra step if they forgot. Generated artifacts from validation runs must be committed too.
- **Technical debt:** None. The guards are minimal and use existing git plumbing.

## Evolution

If `mission.git.commit` gains auto-commit-after-validate functionality, the warning in `mission.validate` may become redundant. Revisit if agents consistently commit after validation and the warning becomes noise.
