---
rfcId: RFC-0644
auditId: AUDIT-RFC-0644-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0644

## Verdict: Needs revision

RFC contains a factual misrepresentation of current behavior (claims "silent data loss" when the code already has a hard block), and several design details need clarification before implementation: the `git add -A` approach conflicts with the established RFC-0580 selective-staging pattern, and the RFC doesn't mention removing the existing guard it replaces.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A1 (Problem section is factually wrong).** The RFC's Problem section (lines 91-96) states that `mission.reconcile` causes "silent data loss" because "uncommitted generated files are invisible to `git fetch` and are left behind." However, the actual code at `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:893-898` already contains a **hard block**:

  ```ts
  const dirtyCheck = isWorkpieceDirty(workpieceDir);
  if (dirtyCheck.dirty) {
    throw new Error(
      `[mission.reconcile] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`pnpm exec werkstatt run mission.git.commit --mission ${missionId} --message "<msg>"\` first, then re-run reconcile.`,
    );
  }
  ```

  The current behavior is NOT silent data loss — it's a descriptive error directing the operator to `mission.git.commit`. The RFC's Problem section must be rewritten to accurately describe the current state: a blocking guard that requires manual commit, not silent data loss. The real problem is "manual commit burden" (which the RFC does list as item 2) — that should be the primary framing.

- **A2 (Missing: existing guard removal).** The RFC's Design section (line 143) says "The call goes at the beginning of `runMissionReconcile`, before `git fetch`" but does not mention that the existing dirty workpiece guard (lines 893-898) must be **removed/replaced**. The `commands.changed` bucket lists `mission.reconcile`, but the RFC should explicitly state that the existing `isWorkpieceDirty` block-and-throw guard is replaced by the auto-commit helper.

- **A3 (Output format: `MissionReconcileData` extension not mentioned).** The RFC's Output format section (lines 152-178) shows `workpieceAutoCommitted` and `workpieceCommitSha` fields in the `--json` output. The existing `MissionReconcileData` interface (lines 799-806) does not have these fields. The RFC should mention that the interface needs to be extended and show the updated type signature.

## Axis B — DNA alignment

No issues. DNA-46 (Mission lifecycle) and DNA-51 (Werkstatt consistency primitives) are correctly referenced and the RFC body explains how auto-commit extends the pattern established by RFC-0580. The `satisfies` field is valid.

## Axis C — Ecosystem fit

- **C1 (`git add -A` conflicts with RFC-0580 pattern).** RFC-0580's `commitWerkstattSideEffects` helper (`packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts:27-29`) stages **only specific file paths** — never `git add -A` — to prevent accidental pickup of foreign changes from concurrent sessions. The RFC proposes `git add -A` for the workpiece (line 141) and justifies it in Alternatives (line 197) and Risks (line 203). However, the RFC does not address why the workpiece is exempt from the selective-staging principle. While the workpiece is a separate git repo with (typically) a single agent, the RFC should explicitly justify this deviation from the established pattern, especially since `mission.git.commit` (the existing workpiece commit command) could be reused instead.

- **C2 (New helper vs. reuse existing `mission.git.commit`).** The RFC proposes a new `commitWorkpieceIfDirty` helper (line 135). However, `mission.git.commit` already exists and handles workpiece commits with pre-commit content validation (RFC-0594). The RFC should explain why a new helper is needed rather than invoking `mission.git.commit` programmatically (or extracting its commit logic into a shared helper). If the `--no-verify` bypass is the reason, the RFC should state this explicitly.

- **C3 (AGENTS.md update not mentioned).** The `packages/os/site-kernel-handoff/AGENTS.md` has a detailed "Werkstatt side-effect auto-commit (RFC-0580)" section (lines 131-140) and a "Reconcile dirty cache clone guard" section (lines 174-188) that documents the existing dirty workpiece guard. The RFC does not mention updating these AGENTS.md sections to reflect the new auto-commit behavior.

## Axis D — Forward-only compliance

No issues. The RFC replaces the blocking guard with auto-commit — no dual-path, no compatibility shim. The existing `isWorkpieceDirty` block-and-throw is removed, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues. The RFC's implementation notes (lines 220-225) are explicit: status gate respected, `--no-verify` justified, `git add -A` mandated, supersede escalation on invariant conflict. No self-authorizing language.

## Axis F — Pragmatism

- **F1 (Over-engineering: new helper when `mission.git.commit` exists).** The `commitWorkpieceIfDirty` helper duplicates commit logic that already exists in `mission.git.commit`. The RFC should consider whether a simpler approach — calling `mission.git.commit` with a generated message when the workpiece is dirty — would suffice. The `--no-verify` requirement might be the differentiator, but the RFC should make this explicit.

- **F2 (`--no-verify` deviation not justified against existing patterns).** The existing `commitWerkstattSideEffects` helper does NOT use `--no-verify` — it uses `gitExec(workspaceRoot, "commit -m ...")` without bypassing hooks. The RFC introduces `--no-verify` for the workpiece (line 141) and justifies it in Risks (line 204). However, the RFC should explain why workpiece hooks are expected to be absent/broken when the workpiece is a clone of the cache clone (which is a clone of the bare repo — hooks would be inherited from the clone source unless explicitly removed).

## Axis G — Blind spots

- **G1 (Merge-in-progress edge case is misanalyzed).** The RFC's Failure modes section (line 184) states: "Pre-existing merge conflicts in workpiece: `git commit` fails because there is no merge in progress. The helper detects this via `git status --porcelain` and skips the commit." This is backwards. If there IS a merge in progress with conflicts, `git status --porcelain` shows `UU` entries — `isWorkpieceDirty` would detect this as dirty, and `git add -A` + `git commit --no-verify` would **fail** because the conflicts are not resolved. The helper does NOT skip the commit in this case — it throws. The RFC should correct this failure mode analysis.

- **G2 (Lock ordering not specified).** The RFC says the auto-commit goes "at the beginning of `runMissionReconcile`" (line 143). In the actual code, the dirty check is at line 893 — after lock acquisition (lines 843-856) and after validation checks (lines 834-870). The RFC should specify that the auto-commit goes **after lock acquisition** (to serialize access) and **after the validation evidence check** (to avoid committing a workpiece that hasn't been validated), replacing the existing dirty guard at line 893.

- **G3 (Interaction with `mission.git.commit` pre-commit validators).** RFC-0594 added pre-commit content validators to `mission.git.commit` (AGENTS.md line 170). The RFC's auto-commit bypasses these validators (`--no-verify` + direct `git commit`). The RFC should acknowledge this trade-off: auto-committed generated files (icons, SBOM, biome CSS) do not need content validation, but if the dirty workpiece also contains content edits, those edits bypass validation. The operator accepted this trade-off (Risks line 203), but the RFC should state it explicitly.

## Questions for the author

1. The current code already blocks `mission.reconcile` with a descriptive error when the workpiece is dirty (line 893-898). Why does the RFC frame this as "silent data loss" when it's actually a hard block? Should the Problem section be rewritten to frame this as "manual commit burden" (replacing the existing block with auto-commit) rather than "silent data loss" (fixing a missing guard)?

2. Why is a new `commitWorkpieceIfDirty` helper needed when `mission.git.commit` already handles workpiece commits? If the `--no-verify` bypass is the differentiator, why not add a `--no-verify` flag to `mission.git.commit` instead of creating a parallel helper?

3. The RFC uses `git add -A` for the workpiece, while RFC-0580's `commitWerkstattSideEffects` uses selective staging. How does the RFC justify this deviation — is the workpiece guaranteed to be single-agent (no concurrent sessions), or is there another reason `git add -A` is safe here?
