---
rfcId: RFC-0584
auditId: AUDIT-RFC-0584-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0584

## Verdict: Needs revision

The RFC correctly identifies a real architectural friction point (bordbuch delete-modify conflict during reconcile) and proposes a sound resolution strategy. However, a markdown formatting bug swallows three sections into a code block, the output format statement is self-contradictory, and the `MissionReconcileData` interface + evidence report changes are not documented.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **TypeScript contracts fence swallows three sections.** The 4-backtick fence at line 119 (`ts`) closes at line 197 (````), which means "### File system responsibilities", "### Output format", and "### Failure modes" are rendered as code block content, not as markdown sections. The closing 4 backticks should be placed immediately after the code (after line 170 `}`), and the output format JSON example should use its own 3-backtick fence.

2. **Contradictory output format statement.** Line 181 says "No change to the `--json` output shape" but then line 181-196 describe adding `autoResolvedPaths` to the output. Adding a field IS a change to the output shape. The statement should say "The `--json` output gains an optional `autoResolvedPaths: string[]` field."

3. **Missing `MissionReconcileData` interface update.** The current interface at `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:525-531` has fields `missionId`, `systemId`, `commitSha`, `preReconcileSha`, `reconciledAt`. The RFC's TypeScript contract shows the merge logic but does not show the interface change needed to add `autoResolvedPaths?: string[]` to `MissionReconcileData`. Without this, the `--json` output cannot include the field.

4. **Summary format change not shown in code.** The output example (line 195) shows a summary with ", 1 bordbuch conflict auto-resolved" appended, but the RFC does not show the code change to the summary string. The actual summary at line 825 is:
   ```ts
   summary: `[mission.reconcile] ${missionId} reconciled (${commitSha ? `${commitSha.slice(0, 8)}, ${transferredCommits} commits merged` : "no git"})`,
   ```
   The RFC should show how the summary is extended when `autoResolvedPaths` is non-empty.

5. **Reconciliation evidence report not mentioned.** The current code writes `evidence/reconciliation-report.json` (lines 789-805) with fields `schemaVersion`, `missionId`, `systemId`, `commitSha`, `preReconcileSha`, `reconciledAt`, `mergeCommitSha`, `transferredCommits`, `message`, `copiedPaths`. The RFC does not mention whether `autoResolvedPaths` should be included in this evidence report for auditability.

## Axis B — DNA alignment

No issues. DNA-46 (Mission lifecycle) is correctly referenced in `satisfies[]`. The RFC is consistent with bordbuch being cache-clone-only (RFC-0473, DNA-46). The auto-resolution preserves the cache clone's authoritative bordbuch state, which aligns with DNA-46's description of bordbuch as an append-only hash-chained log in the cache clone.

## Axis C — Ecosystem fit

No issues. The change is in `@warpgogol/site-kernel-handoff` which owns `mission.reconcile` (confirmed by `packages/os/site-kernel-handoff/AGENTS.md`). The `commands.changed` bucket correctly lists `mission.reconcile`. No new commands or flags. No cross-package imports needed.

## Axis D — Forward-only compliance

No issues. The fix is purely additive — it adds auto-resolution for a conflict that previously caused a hard failure. No backward compatibility layer, no dual-path, no flag.

## Axis E — Agent-facing policy

No issues. The RFC status is `draft` and implementation notes (line 240) correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. The anti-fabrication note about `--theirs` (line 243) is a useful agent guardrail.

## Axis F — Pragmatism

No issues. Minimal change surface — no new command, no new flag, no new package. The reactive approach (try merge, catch conflict, auto-resolve) is simpler than preventive alternatives. The `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

1. **No error handling for auto-resolution step failure.** If `git checkout --ours bordbuch/` or `git add bordbuch/` fails (e.g., bordbuch directory doesn't exist in the cache clone's version, or a permissions issue), the error propagates unhandled, leaving the cache clone in a conflicted merge state. The RFC should wrap the auto-resolution steps in a try/catch with a `git merge --abort` fallback and a descriptive error message.

2. **`git status --porcelain` failure inside catch block.** The RFC's code calls `execSync("git status --porcelain", ...)` inside the catch block for `git merge`. If this command also fails, the error would propagate as an unhandled exception, masking the original merge error. The RFC should wrap this in a try/catch that falls through to the existing error message.

3. **Reconciliation report auditability.** The evidence report (`reconciliation-report.json`) is the durable record of the reconcile operation. If `autoResolvedPaths` is only in the `--json` output but not in the evidence report, the auto-resolution is not auditable after the fact. The RFC should explicitly include `autoResolvedPaths` in the evidence report.

4. **Edge case: bordbuch directory exists but `events.ndjson` is not the conflicted file.** The RFC uses `git checkout --ours bordbuch/` (directory-level). If only `bordbuch/events.ndjson` is conflicted but other bordbuch files exist and are not conflicted, the directory-level checkout is still correct (it only affects conflicted files). However, the RFC should note that `autoResolvedPaths` should list the actual conflicted paths (from `conflictedPaths`), not just `["bordbuch/events.ndjson"]` as a hardcoded value.

## Questions for the author

1. Should `autoResolvedPaths` be included in the `reconciliation-report.json` evidence file (for auditability), or only in the `--json` command output?
2. What happens if `git checkout --ours bordbuch/` fails mid-auto-resolution — should the command `git merge --abort` and throw, or attempt a different recovery?
3. Should `MissionReconcileData.autoResolvedPaths` be optional (`string[]?`, absent when no auto-resolution occurred) or always present (empty array `[]` when no auto-resolution)?
