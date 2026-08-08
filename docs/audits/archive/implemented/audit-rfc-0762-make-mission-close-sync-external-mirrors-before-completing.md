---
rfcId: RFC-0762
auditId: AUDIT-RFC-0762-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0762

## Verdict: Needs revision

The RFC addresses a real gap — `mission.close` mutates the cache clone after the RFC-0705 mirror check, leaving mirrors behind. However, the TypeScript contracts section presents a `CloseReportMirror` interface that conflicts with the existing one (established by RFC-0705), and the `executeKernelCommand` call signature does not match the actual API shape used in the codebase. These must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19**: `RFC-0762.amends` includes `RFC-0705`, but `RFC-0705.amendedBy` does not include `RFC-0762`. This is a bidirectional reference issue — the enhance step should add `RFC-0762` to RFC-0705's `amendedBy` field.

## Axis A — Structural completeness

- **A-1 (TypeScript contracts — `CloseReportMirror` conflict)**: The RFC proposes (lines 97–101):
  ```ts
  interface CloseReportMirror {
    synced: boolean;
    syncError: string | null;
    mirrorSha: string | null;
  }
  ```
  But the existing interface in `@/packages/os/site-kernel-handoff/src/mission/mission-close.ts:81-86` is:
  ```ts
  export interface CloseReportMirror {
    originSha: string | null;
    mirrorSha: string | null;
    inSync: boolean;
    recommendation: string | null;
  }
  ```
  The RFC does not mention it is replacing an existing interface. Removing `originSha`, `inSync`, and `recommendation` would break the RFC-0705 blocking check (lines 302–320) which reads `mirrorInSync` and `recommendation`. The RFC must clarify: is it extending the interface (adding `synced`/`syncError` alongside existing fields) or replacing it? If extending, the contracts section should show the full interface with both old and new fields.

- **A-2 (TypeScript contracts — `executeKernelCommand` signature)**: The RFC shows (lines 104–108):
  ```ts
  const syncResult = await executeKernelCommand(
    "sternsystem.sync",
    ["--id", manifest.systemId],
    context,
  );
  ```
  The actual API in the codebase (mission-close.ts:438–446, mission-materialization-commands.ts:1241–1245) uses an object parameter:
  ```ts
  const syncResult = await executeKernelCommand({
    workspaceRoot,
    commandName: "sternsystem.sync",
    argv: [`--id=${manifest.systemId}`],
  });
  ```
  The call signature in the RFC does not match the real API. This will mislead the implementing agent.

- **A-3 (Output format — incomplete)**: The output format section (lines 133–142) shows only `mirror.synced`, `mirror.syncError`, and `mirror.mirrorSha`. It omits the existing `mirror.originSha`, `mirror.inSync`, and `mirror.recommendation` fields. The implementing agent needs to see the full output shape to avoid accidentally dropping fields.

## Axis B — DNA alignment

- **B-1 (DNA-46 satisfaction)**: The RFC claims `satisfies: [DNA-46]` and the body (line 71) explains how it "extends `mission.close` to guarantee mirror consistency after close, completing the lifecycle invariant." This is accurate — DNA-46 (Mission lifecycle) is enforced by `mission.close`, and the RFC extends that enforcement to include post-close mirror sync. No issue.

- **B-2 (Related DNA references)**: `related: [DNA-46, RFC-0355, RFC-0356]` — all are relevant. DNA-46 is the mission lifecycle invariant, RFC-0355 established `mission.close`, RFC-0356 established `mission.reconcile`. No issue.

## Axis C — Ecosystem fit

- **C-1 (AGENTS.md update not mentioned)**: RFC-0705 updated root AGENTS.md (line 177 of RFC-0705: "Update the rule from 'MUST invoke' to 'automatically enforced by mission.reconcile and mission.close'"). RFC-0762 does not mention updating AGENTS.md to reflect that `mission.close` now also syncs mirrors automatically (not just blocks on desync). The file system responsibilities table (lines 124–127) lists only two files — it should include `AGENTS.md` if the rule text needs updating.

- **C-2 (Compass `docs/*.xml` sync not addressed)**: RFC-0705 explicitly stated "Compass `docs/*.xml` files do not reference `mission.reconcile`, `mission.close`, or `sternsystem.sync` behavior — no `docs/*.xml` synchronization is needed." RFC-0762 does not address this. The implementing agent needs to know whether `docs/*.xml` files reference `mission.close` mirror sync behavior.

- **C-3 (Command lifecycle — `commands.changed`)**: `commands.changed: [mission.close]` is correct — `mission.close` is an existing registered command being modified. No issue.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims, dual paths, or deprecation grace periods. It extends an existing command with a new internal step.

## Axis E — Agent-facing policy

- **E-1 (Implementation notes — missing RFC references)**: The implementation notes (lines 180–185) reference "RFC-0224 preconditions" and "RFC-0334" but do not reference RFC-0705 (the RFC being amended) or RFC-0472 (sternsystem.sync fail-fast behavior). RFC-0705's implementation notes explicitly referenced RFC-0330 (verification evidence) and RFC-0334. RFC-0762 should reference RFC-0705 to make the amend relationship explicit for the implementing agent.

- **E-2 (Status gate)**: The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. No issue.

## Axis F — Pragmatism

- **F-1 (Redundancy with RFC-0705 blocking check)**: RFC-0705 already blocks `mission.close` if mirrors are desynced before close (lines 314–320 of mission-close.ts). RFC-0762 adds a post-close sync. The sequence is: RFC-0705 check (block if desynced) → close commits (pin, state, bordbuch) → RFC-0762 sync (push new commits to external mirrors). This is not redundant — the pre-close check verifies the state before close, the post-close sync propagates the new commits created by close. The RFC should explicitly acknowledge this two-phase design and explain why both are needed (pre-close: prevent closing on a desynced system; post-close: propagate close-created commits).

- **F-2 (Minimal command surface)**: No new commands, no new flags. The sync is internal. No issue.

## Axis G — Blind spots

- **G-1 (Performance — sync after close)**: The risks section (line 165) mentions "5-30 seconds" for the sync. This is realistic for a git push to GitHub. However, the RFC does not mention that `mission.close` already runs `evidence.sync` to R2 (which can take several minutes). The sync is additive to an already long-running command. This is acceptable but should be noted.

- **G-2 (Edge case — `executeKernelCommand` throws)**: The failure modes section (line 148) says "executeKernelCommand throws (unexpected): Caught and logged as `logger.warn`. Close still succeeds." But the existing pattern in mission-close.ts (evidence.sync, line 456–461) throws on sync failure. The RFC should clarify why mirror sync is non-fatal while evidence sync is fatal — both are post-close consistency guarantees.

- **G-3 (Edge case — `sternsystem.sync` bordbuch entry)**: RFC-0705's implementation notes (line 294) warn that `sternsystem.sync` produces a `mirror-sync` bordbuch entry and a `commitAndPushBordbuch` commit. RFC-0762 does not mention this. The implementing agent needs to know that calling `sternsystem.sync` from close will create additional bordbuch entries and cache clone commits — which must happen before the final `.materialization-state.json` commit, not after.

## Questions for the author

1. Should `CloseReportMirror` be extended (add `synced`/`syncError` alongside `originSha`/`inSync`/`recommendation`) or replaced? If extended, show the full interface in the TypeScript contracts section.
2. Why is mirror sync non-fatal in close (logger.warn) when evidence sync is fatal (throws `EVIDENCE_SYNC_FAILED`)? Both are post-close consistency guarantees — should they have the same failure behavior?
3. Does `sternsystem.sync` called from close produce bordbuch entries and cache clone commits? If so, should the sync happen before the `.materialization-state.json` write (so the state file captures the final HEAD including sync commits)?
