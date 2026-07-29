---
rfcId: RFC-0585
auditId: AUDIT-RFC-0585-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0585

## Verdict: Needs revision

The RFC correctly identifies a real gap (all hashes pending, no production build, no dist guard in publish) and the proposed direction aligns with DNA-48/52/53 and RFC-0357 §6.1. However, it has a significant blind spot around the readable snapshot source (mission.validate does not currently produce one), omits the `behavior.snapshot.diff` step that RFC-0357 §6.1 step 7 requires, and its `ReleasePrepareData` TypeScript contract drops fields that will break existing consumers.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Decision** is present-tense and single — good.
- **CLI surface** shows exact invocations — good.
- **TypeScript contracts**: `ReleasePrepareData` (RFC line 145–159) adds `siteContentHash`, `distTreeHash`, `readableSnapshotHash`, `buildReused` but **drops `behaviorSnapshotHash`** which exists in the current interface (`release-commands.ts:117`). The RFC must either keep it or explicitly state it is removed. Removing it without mention will break the `KernelCommandResult<ReleasePrepareData>` return type and any consumers.
- **Failure modes table** (line 235–243) is mostly good, but the row "mission.build not run and workpiece has no dist/" says "runs fresh production build" with exit code 0 — this is correct but the table does not document what happens when `astro build` itself fails inside `release.prepare` (exit code 1 is implied by "Production build fails" row, but the first row's "0 (success)" is misleading when the build is the action).
- **Rollout** says "Existing releases (r000001–r000003) are deleted" — this is a destructive operation. The RFC should specify whether deletion is manual (operator) or automated by a command, and whether `release.rollback` is needed first for any published ones.
- **Acceptance criteria** are checkable and cover the scope — good.
- **Implementation notes** are explicit behavioral rules — good.

## Axis B — DNA alignment

- **DNA-48** (Release discipline): The RFC restores the hash-verified artifact gate. The `satisfies` entry is correct and the body explains how (line 118).
- **DNA-52** (Release artifact store): Correct — real `distTreeHash` enables `artifact.store.put` verification (line 119).
- **DNA-53** (Semantic fingerprint governance): The RFC says all hashes use `@warpgogol/fingerprint` (line 120, 295). However, the current `behavior-snapshot-commands.ts:49` uses `crypto.createHash("sha256")` directly for `hashContent`, and `artifact-store-commands.ts:59` also uses `crypto.createHash` directly. The RFC should note that existing snapshot hash computation violates DNA-53 and that this RFC's implementation must migrate those to `@warpgogol/fingerprint` as part of the work, or explicitly scope that out as a non-goal.
- No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries**: All changes are within `@warpgogol/site-kernel-handoff` — correct.
- **Pipeline placement**: The RFC correctly moves the dist-presence gate from `leitstand.propagate` preflight to `release.publish` (fail-fast). This is architecturally sound.
- **`behavior.snapshot.capture` reuse**: The RFC's Risks section (line 266) correctly identifies that the existing `behavior.snapshot.capture` command can be invoked from `release.prepare`. The implementation should call `runBehaviorSnapshotCapture` in-process rather than shelling out.
- **`behavior.snapshot.diff` omission**: RFC-0357 §6.1 step 7 requires `behavior.snapshot.diff` between readable and production snapshots. The current `release.prepare` implementation hardcodes `snapshotDiffVerdict: "pass"` without running a diff. This RFC does not mention restoring the diff step — it only addresses build, snapshot capture, and hash computation. The RFC should either explicitly include the diff restoration or list it as a non-goal with justification.
- **AGENTS.md updates**: The `packages/os/site-kernel-handoff/AGENTS.md` release section does not exist — the RFC does not mention adding one. Minor, but the handoff AGENTS.md should document the new `release.prepare` behavior.
- **Command lifecycle**: `commands.changed: [release.prepare, release.publish]` is correct — no new commands.

## Axis D — Forward-only compliance

- No compatibility shims, no dual-path, no flags — good.
- "No grace period, no `--strict` opt-in" (line 249) — correct forward-only stance.
- Deleting existing releases r000001–r000003 is forward-only — acceptable, but should be explicit about who does it and how.

## Axis E — Agent-facing policy

- **Status gate**: RFC is `draft` and does not self-authorize implementation — good.
- **Implementation notes** reference the correct governance rules (RFC-0224, RFC-0330, RFC-0334) — good.
- **Anti-fabrication**: No content authoring claims — good.
- **Storage policy**: No cookies or client-side persistence — good.
- **Manual hash editing prohibition** (line 293) — excellent agent-facing rule.

## Axis F — Pragmatism

- **Minimal command surface**: No new commands, only behavior changes to existing ones — good.
- **Lean contracts**: `BuildInputHashInput` (line 172–176) has `platformSemanticHash` which is already computed in the current code — reasonable. But `buildReused: boolean` in `ReleasePrepareData` is a new field that is not used by any consumer yet. It is informational and acceptable.
- **Existing patterns**: The RFC correctly reuses `behavior.snapshot.capture` and `@warpgogol/fingerprint` rather than inventing new infrastructure.
- **Scope discipline**: `packagesImpacted` lists only `@warpgogol/site-kernel-handoff` — correct. `appsImpacted: []` — correct (no app changes needed).

## Axis G — Blind spots

- **Readable snapshot source**: The RFC says `release.prepare` "copies readable behavior snapshot from `missions/<id>/evidence/`" (line 275, 188). However, `mission.validate` does NOT currently produce a readable behavior snapshot file. It only writes `validation-report.json` and `materialization-report.json` to `evidence/`. The grep for `readable-snapshot` in `missions/*/evidence/` returns no results in the mission validation code. The RFC must either: (a) specify that `mission.validate` is also modified to produce `evidence/readable-snapshot.json`, or (b) specify that `release.prepare` captures the readable snapshot itself from the workpiece `dist/` (running `behavior.snapshot.capture --build-kind readable` on the existing build output). Option (b) is simpler and avoids coupling.
- **Build input hash determinism**: The Risks section (line 268) mentions this, but the RFC does not specify what exactly goes into the build input hash. `BuildInputHashInput` has `workpiecePath`, `platformVersion`, `platformSemanticHash` — but `workpiecePath` is a filesystem path, not content. The hash should be of the workpiece **content tree**, not the path string. The field name `workpiecePath` is misleading; it should be `workpieceTreeHash` or similar.
- **Concurrent execution**: Two `release.prepare` calls for the same mission — the RFC-0362 lock on `system:<id>` and `release:<id>` handles this (existing behavior). Not a gap.
- **Interrupted operations**: If `astro build` crashes mid-write inside `release.prepare`, the staging directory is cleaned up by the existing `atomicMoveDir` pattern. Not a gap.
- **Build environment**: The RFC correctly identifies the Node/pnpm/Astro dependency (line 265) — acceptable.

## Questions for the author

1. Where does the readable behavior snapshot come from? `mission.validate` does not produce `evidence/readable-snapshot.json` today. Should `release.prepare` capture it itself from the workpiece `dist/`, or should `mission.validate` be modified to produce it?
2. Why does `ReleasePrepareData` drop `behaviorSnapshotHash`? The current interface has it — is this intentional, and if so, what replaces it in the return shape?
3. Should `behavior.snapshot.diff` (RFC-0357 §6.1 step 7) be restored as part of this RFC, or is it explicitly a non-goal? The current implementation hardcodes `snapshotDiffVerdict: "pass"` — this RFC does not address that.
4. `BuildInputHashInput.workpiecePath` is a path string, not content — should this be a tree hash of the workpiece content for the reuse decision to be deterministic?
5. Should the existing `crypto.createHash` usage in `behavior-snapshot-commands.ts` and `artifact-store-commands.ts` be migrated to `@warpgogol/fingerprint` as part of this RFC, or is that a separate concern?
