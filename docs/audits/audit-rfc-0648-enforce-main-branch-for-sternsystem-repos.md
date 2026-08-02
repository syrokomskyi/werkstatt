---
rfcId: RFC-0648
auditId: AUDIT-RFC-0648-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0648

## Verdict: Needs revision

The RFC is structurally sound and well-aligned with DNA-44/DNA-45, but the file system responsibilities table significantly undercounts the test files that need updating — 11+ test files have local `gitInit` helpers using `git init` without `-b main`, and tests exercising the `sternsystem.status`/`mission.close` fallback path will fail after the fallback changes to `"main"`. A secondary gap is the missing `mission-materialize.ts:1002` `git init` fallback in the scope.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is a single clear statement in present tense. CLI surface shows exact invocations. TypeScript contracts are minimal (no new types, just a new `rule` value). File system responsibilities table names concrete paths. Output format documents the `--json` shape. Failure modes specify exit codes and skip conditions. Rollout describes migration path for existing and new systems. Alternatives considered has 3 real alternatives with rejection reasons. Risks includes agent misinterpretation risk and false-positive rate. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-44, DNA-45]` — both exist in `docs/architecture-dna.md`. The RFC body explains how it extends DNA-44 (bundle contract with branch name convention) and DNA-45 (implicit convention enforced by `sternsystem.validate`). No conflicts with existing DNA invariants. No new DNA invariant is established by this RFC.

## Axis C — Ecosystem fit

**Finding C1 — Incomplete test file list.** The file system responsibilities table lists only 2 test files: `sternsystem-sync-integration.test.ts` and `tests/helpers/materialize-fixture.ts`. However, a grep for `git init` in `packages/os/site-kernel-handoff/src` reveals 11+ test files with local `gitInit` functions that call `execSync("git init", ...)` without `-b main`:

- `tests/mission-validate-snapshot-auto-regen.test.ts:132`
- `tests/mission-materialize-baseline.test.ts:63`
- `tests/mission-validate-distribution-reuse.test.ts:67`
- `tests/rfc-0614-public-well-known-bordbuch-conflict.test.ts:18`
- `tests/werkstatt-commit.test.ts:18`
- `tests/mission-build-check-phase.test.ts:84`
- `tests/mission-validate-cache-clone-warning.test.ts:18`
- `tests/mission-dirty-guard.test.ts:19`
- `tests/mission-close-state-file.test.ts:37`
- `tests/mission-open-clean-tree.test.ts:19`
- `tests/helpers/materialize-fixture.ts:16` (mentioned)

After the fallback in `sternsystem.status:124` and `mission-close.ts:301` changes from `"master"` to `"main"`, any test that exercises the fallback path (where `git symbolic-ref HEAD` fails) on a repo created with `git init` (defaulting to `master`) will fail: the fallback will try `rev-parse main` on a `master`-branch repo. The RFC should either list all affected test files or state that all `gitInit` helpers across the test suite must be updated to `git init -b main`.

**Finding C2 — Missing `command.manifest.generate` step.** The RFC lists `sternsystem.validate`, `sternsystem.status`, and `mission.close` in `commands.changed` but does not mention running `command.manifest.generate` after implementation to update `docs/command-manifest.generated.yaml`. This is a standard post-implementation step when commands are changed (RFC-CMD-02).

## Axis D — Forward-only compliance

No issues. The fallback change from `"master"` to `"main"` is a direct replacement — no compatibility shim, no dual-path, no grace period. The migration is a one-time `git branch -m master main` per repo. Legacy `"master"` fallback is deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues. The RFC is in `draft` status and does not contain self-authorizing language. Implementation notes explicitly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." The RFC includes a clear anti-auto-rename rule: "Agents MUST NOT rename git branches automatically." References to RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation) are correct.

## Axis F — Pragmatism

No issues. No new commands — extends existing `sternsystem.validate` with a new rule, following the established pattern of the existing `bundle-contract`, `mirror-remote-mismatch`, etc. rules. No new types — the `branch-convention` rule reuses the existing `violations` array shape. `packagesImpacted` lists only `@warpgogol/site-kernel-handoff` — correct. `appsImpacted` is empty — correct for a workspace-level change. `nonGoals` are explicit and meaningful (monorepo branch, workpiece validation, global git config, external mirror renaming).

## Axis G — Blind spots

**Finding G1 — `mission-materialize.ts:1002` `git init` fallback.** The RFC's file system responsibilities table mentions `mission-materialize.ts:341,367` (comments referencing `origin/master`) but does not mention line 1002, which has a `git init` fallback for the non-git cache clone path:

```ts
// RFC-0568: Non-git cache clone fallback — use git init (no shared history)
execSync("git init", { cwd: workpieceDir, stdio: ["pipe", "pipe", "pipe"] });
```

This creates a workpiece with `master` as the default branch. While workpieces are excluded from branch validation (nonGoals), the `mission.close` fallback change from `"master"` to `"main"` means that if `symbolic-ref HEAD` fails on such a workpiece (detached HEAD edge case), the fallback will try `rev-parse main` on a `master`-branch repo and fail. The RFC should either include this `git init` call in the file system responsibilities (change to `git init -b main`) or explicitly acknowledge this edge case in the failure modes section.

## Questions for the author

1. The file system responsibilities table lists only 2 test files, but 11+ test files have local `gitInit` helpers that will create `master`-branch repos. Should all `gitInit` helpers across the test suite be updated to `git init -b main`, or only the 2 mentioned? If only the 2, how will tests exercising the `sternsystem.status`/`mission.close` fallback path on `master`-branch repos be handled?
2. Should `mission-materialize.ts:1002` (`git init` fallback for non-git cache clone) also be changed to `git init -b main` to prevent the `mission.close` fallback mismatch on detached HEAD?
3. Should `sternsystem.validate` also check external mirror (mirrors[2+]) branch names, or is the manual-only approach for external mirrors sufficient given that `sternsystem.sync` pushes from the bare repo which will already be `main`?
