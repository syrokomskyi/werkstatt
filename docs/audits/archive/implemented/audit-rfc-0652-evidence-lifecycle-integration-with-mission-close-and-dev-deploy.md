---
rfcId: RFC-0652
auditId: AUDIT-RFC-0652-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0652

## Verdict: Needs revision

The RFC has a solid architectural design and clear integration points, but contains a factual error in the file system responsibilities table (wrong package for `leitstand-commands.ts`), a code snippet using a non-existent `executeKernelCommand` API shape, a template literal bug in the cleanup code, and does not address the dependency on RFC-0650/0651 being accepted first. The `satisfies` field also needs adjustment since DNA-59 is not yet established.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-18**: `related "DNA-59"` is not defined in `docs/architecture-dna.md`. DNA-59 is established by RFC-0650, which is still `draft`. This is expected given the dependency chain, but the warning will persist until RFC-0650 is accepted and the DNA-59 entry is appended.

## Axis A — Structural completeness

1. **Code snippet API mismatch**: The `mission.close` integration code (lines 167-170) uses `executeKernelCommand("evidence.sync", { flags: { mission: missionId }, cwd: context.cwd })`. The actual API signature is `executeKernelCommand({ workspaceRoot, commandName, argv })` — see `@/packages/os/site-kernel/src/types.ts:381-393`. The `leitstand.dev-deploy` snippet (lines 191-194) has the same issue. Both snippets should use `executeKernelCommand({ workspaceRoot, commandName: "evidence.sync", argv: [`--mission=${missionId}`] })`.

2. **Template literal bug in cleanup code**: Line 224 has `cleaned.push("evidence (older than {retentionDays} days)")` — this is a plain string, not a template literal. The `{retentionDays}` placeholder will not be interpolated. Should be `` `evidence (older than ${retentionDays} days)` ``.

3. **Line reference inaccuracy**: The RFC says `mission-cleanup.ts` line 79 for `skipped.push("evidence (preserved)")`. The actual line is 80 (`@/packages/os/site-kernel-handoff/src/mission/mission-cleanup.ts:80`). Minor, but evidence annotations should be precise.

## Axis B — DNA alignment

1. **`satisfies` field includes DNA-49 but the RFC body only weakly explains how it extends it**: The RFC says `leitstand.dev-deploy` adds best-effort `evidence.sync` after `axiom.report`. DNA-49 defines `leitstand.dev-deploy` with Axiom gate verification. The connection is valid — preserving gate results extends the fleet propagation contract — but the explanation in the Architectural fit section (line 118) is one sentence. Compare to the DNA-46 explanation (line 117) which is more thorough. Both should be equally grounded.

2. **DNA-59 in `related[]` but not `satisfies[]`**: Correct placement since DNA-59 does not exist yet. However, the RFC body (line 119) says "DNA-59 (Evidence preservation): Established by RFC-0650. This RFC makes the preservation contract operational by wiring it into the lifecycle." Once RFC-0650 is accepted and DNA-59 is added to `docs/architecture-dna.md`, this RFC should add `DNA-59` to `satisfies[]` — it directly extends the invariant by making preservation operational. The rollout section should note this as a post-RFC-0650-acceptance action.

3. **No DNA conflict**: The RFC does not conflict with any existing DNA invariant. It extends DNA-46 and DNA-49 without superseding them.

## Axis C — Ecosystem fit

1. **Wrong package for `leitstand-commands.ts`**: The file system responsibilities table (line 263) lists `packages/os/site-kernel-checks/src/leitstand/leitstand-commands.ts`. The actual file is at `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`. This is a factual error — the file is in `site-kernel-handoff`, not `site-kernel-checks`.

2. **`packagesImpacted` includes `@warpgogol/site-kernel-checks` incorrectly**: Since `leitstand-commands.ts` is in `site-kernel-handoff` (not `site-kernel-checks`), and `mission-close.ts` and `mission-cleanup.ts` are also in `site-kernel-handoff`, the `packagesImpacted` field should only list `@warpgogol/site-kernel-handoff`. The `@warpgogol/site-kernel-checks` entry should be removed unless there is a file in that package that needs changes (none identified in the file system responsibilities table after correcting the package path).

3. **Command lifecycle buckets**: `commands.changed` lists `mission.close`, `mission.cleanup`, and `leitstand.dev-deploy` — all three are existing registered commands gaining new flags/behavior. This is correct.

4. **AGENTS.md updates**: The RFC identifies root `AGENTS.md` and `packages/os/site-kernel-handoff/AGENTS.md` for documentation updates. This is correct given the corrected package location.

## Axis D — Forward-only compliance

No issues. The `--skip-evidence-sync` flag is a new opt-out, not a legacy compatibility path. The `--evidence-retention-days 0` is a configuration option that restores prior behavior — it is a flag value, not a shim or dual-path. The unconditional preservation behavior is replaced with age-based cleanup (forward-only), with `0` as an explicit operator choice, not a default.

## Axis E — Agent-facing policy

1. **Status gate**: The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.

2. **Implementation notes are explicit**: Lines 376-382 contain clear behavioral rules: MUST NOT use `--skip-evidence-sync` routinely, MUST NOT invoke `evidence.sync` independently, MUST NOT set `--evidence-retention-days` to 0, MUST NOT weaken mandatory sync. These are actionable agent rules.

3. **Missing dependency note**: The implementation notes do not mention that RFC-0650 and RFC-0651 must be accepted and implemented first. Without `evidence.sync` (RFC-0651) and `runTimestamp` in `evidence-metadata.json` (RFC-0650), this RFC cannot be implemented. The notes should state: "Agents MUST NOT implement this RFC until RFC-0650 and RFC-0651 are both `accepted` (or `implemented`)."

## Axis F — Pragmatism

1. **Minimal command surface**: No new commands — three existing commands gain new flags. This is the leanest possible approach.

2. **`mission.cleanup` `--older-than` mode not addressed**: The RFC only modifies the `--mission` mode of `mission.cleanup` (single mission cleanup). The `--older-than` mode (batch cleanup of closed missions older than a threshold) does not touch evidence at all — it only removes `workpiece/` and `distribution/`. The RFC should specify whether `--older-than` mode also applies age-based evidence cleanup or continues to preserve evidence unconditionally. This is a scope gap.

3. **`evidence/` vs `evidence/axiom/`**: The `mission.close` code checks `evidence/axiom/` (Axiom evidence). But `mission.close` also writes `close-report.json` to `evidence/` (not `evidence/axiom/`). The `mission.cleanup` code also only cleans `evidence/axiom/`. What happens to `close-report.json` and `workpiece.git-bundle` in `evidence/`? The RFC should clarify whether non-Axiom evidence artifacts are preserved or cleaned.

## Axis G — Blind spots

1. **Empty evidence directory edge case**: The `mission.close` code checks `existsSync(evidenceDir)` for `evidence/axiom/` but does not check for `evidence-metadata.json`. If a mission never ran `mission.check`, the `evidence/axiom/` directory may not exist — the sync is skipped (good). But if the directory exists but is empty or missing `evidence-metadata.json`, `evidence.sync` (RFC-0651) will fail with `INVALID_EVIDENCE`, which will make `mission.close` fail with `EVIDENCE_SYNC_FAILED`. The RFC should specify: what if the mission has no Axiom evidence? Should `mission.close` skip sync silently, or fail? The current design (check `existsSync(evidenceDir)`) is insufficient — it should check for `evidence-metadata.json` existence.

2. **Performance impact on `mission.close`**: The Risks section mentions 172 MB upload taking ~17 seconds for `leitstand.dev-deploy` (non-blocking). But for `mission.close`, the sync is **mandatory and blocking**. Adding a 17+ second upload to `mission.close` (which already takes time for validation, bordbuch commit, etc.) is a significant latency increase. The RFC should document the expected time impact on `mission.close` and whether the operator should be warned.

3. **Concurrent `evidence.sync` from `leitstand.dev-deploy` and `mission.close`**: If a dev deploy is running its best-effort sync while `mission.close` is invoked for the same mission, both would attempt to upload to the same R2 key prefix. The RFC does not address concurrent execution. R2 PutObject is idempotent for the same key, so the last writer wins — but the Iceberg table might get duplicate rows. The RFC should note this edge case.

4. **`mission.cleanup` `--older-than` mode and evidence**: The `--older-than` mode removes `workpiece/` and `distribution/` for closed missions but does not remove `evidence/`. After this RFC, should `--older-than` mode also apply the age-based evidence cleanup? The RFC only modifies the `--mission` mode code path. This is a blind spot — the operator might expect `--older-than 30d` to also clean evidence older than 30 days.

## Questions for the author

1. Should `mission.close` skip `evidence.sync` silently when `evidence-metadata.json` is missing (no Axiom evidence was ever produced), or should it fail? The current code design checks `existsSync(evidenceDir)` but not `existsSync(evidence-metadata.json)` — this gap could cause `EVIDENCE_SYNC_FAILED` for missions that never ran `mission.check`.

2. Should `mission.cleanup --older-than <N>d` also apply age-based evidence cleanup, or only the `--mission <id>` mode? The RFC only modifies the `--mission` code path, leaving `--older-than` mode with unconditional evidence preservation.

3. What is the expected latency impact on `mission.close` when `evidence.sync` uploads 172 MB? Should the operator see a progress indicator, or is the ~17 second wait acceptable without feedback?
