---
rfcId: RFC-0616
auditId: AUDIT-RFC-0616-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0616

## Verdict: Needs revision

The RFC's core contract — `depth` as a **required** field — contradicts the actual implementation, where both schema copies declare `depth` as `.optional()`. New locks are created without `depth: 1`, tests expect `depth` to be `undefined` on first acquire, and the `acquireLock`/`releaseLock` handlers use `?? 1` fallbacks that only make sense if `depth` is optional. Multiple acceptance criteria are marked `[x]` but are not actually met.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Schema contract mismatch (critical).** The RFC declares `depth: z.number().int().positive()` as required (line 127). The actual code has `depth: z.number().int().positive().optional()` in both `packages/forge/os/werkstatt/handlers/schema.ts:29` and `packages/ontology/src/operations/werkstatt.ts:30`. The RFC's own implementation notes (line 234) say "Agents MUST NOT add `.optional()` to the `depth` field — it is required" — yet the code does exactly that.

2. **New lock creation omits `depth`.** `lock.ts:88-98` creates a new lock object without a `depth` field. If `depth` were truly required, `werkstattLockSchema.parse(lock)` at line 100 would throw. It doesn't, because the schema has `.optional()`. The RFC's pseudo-code (line 153) says "New lock: write with depth=1" — the implementation does not do this.

3. **`?? 1` fallbacks contradict required contract.** `lock.ts:70` uses `(existing.depth ?? 1) + 1` and `lock.ts:111` uses `(lock.depth ?? 1) > 1`. These nullish-coalescing fallbacks only make sense if `depth` can be `undefined`, which is only true when the field is `.optional()`. A truly required field would never need `?? 1`.

4. **Test expects `depth` to be `undefined`.** `werkstatt-lock.test.ts:132` asserts `expect(lock1.depth).toBeUndefined()` — directly contradicting the RFC's contract that `depth` is required and should be `1` for a new lock.

5. **Failure mode incorrectly documented.** Line 194 states: "Old lock file without `depth` field: Schema parse fails; `acquireLock` treats it as corrupt and overwrites." With `.optional()`, the schema parse does **not** fail — it succeeds. The documented failure mode is wrong.

6. **Rollout section inaccurate.** Line 198 says "Old lock files without `depth` are treated as corrupt and overwritten on next acquire." With `.optional()`, old lock files without `depth` parse successfully and are **not** overwritten — they are treated as valid locks.

7. **Test evidence line range slightly off.** RFC cites `208-221` for re-entrant release tests; the actual test "decrements depth for re-entrant lock instead of deleting" spans lines 205-218.

8. **"Preserves operationId" not tested.** Criterion line 221 says `acquireLock` "preserves original `operationId`/`command`". The test at line 133 acquires with `op-002` as inner but never asserts `lock2.operationId === "op-001"`. The behavior is implemented (via `...existing` spread at `lock.ts:69`) but not verified by tests.

## Axis B — DNA alignment

- **DNA-51** is correctly referenced and the RFC body explains how re-entrancy extends the lock primitive without weakening inter-process exclusion. No issues.

## Axis C — Ecosystem fit

1. **Missing AGENTS.md update.** The Risks section (line 215) acknowledges: "The AGENTS.md rule for `packages/forge` should document the re-entrant behavior." No acceptance criterion covers this, and `packages/forge/AGENTS.md` does not mention re-entrant locks. This is an identified but unaddressed gap.

2. **Schema duplication correctly identified.** The RFC correctly identifies that `werkstattLockSchema` exists in both `packages/forge/os/werkstatt/handlers/schema.ts` and `packages/ontology/src/operations/werkstatt.ts` and must stay in sync (line 103, 216). Both currently have `.optional()` — they are in sync, but with the wrong contract.

## Axis D — Forward-only compliance

- The RFC explicitly states "No migration path" and "forward-only monorepo — no legacy compatibility layer" (line 198). This is correct in principle. However, the actual `.optional()` implementation **is** a de facto compatibility layer — it allows old lock files without `depth` to coexist. This contradicts the forward-only stance.

## Axis E — Agent-facing policy

1. **Acceptance criteria marked `[x]` but not met.** Criterion line 220 claims `depth` is "required" in both schemas — it is `.optional()` in both. Criterion line 54 ("depth field is required in werkstattLockSchema") is listed as a success signal but is not met. These `[x]` marks are inaccurate.

2. **Implementation notes contradict the code.** Line 234 says "Agents MUST NOT add `.optional()` to the `depth` field" — but the code has `.optional()`. Line 232 says "The fix is already applied in the codebase (commit `0896e17`)" — the commit exists but doesn't match the RFC's stated contract.

## Axis F — Pragmatism

1. **Success signal unmet.** "depth field is required in werkstattLockSchema" (line 54) is listed as a success signal but the field is `.optional()`.

2. **The `.optional()` approach is arguably more pragmatic** than the RFC's stated required contract — it avoids breaking existing lock files and is a softer migration. But the RFC should describe what was actually implemented, not what was intended but not fully applied.

## Axis G — Blind spots

1. **`heartbeatLock` re-validates with schema.** `lock.ts:132` calls `werkstattLockSchema.parse()` on the existing lock before updating `heartbeatAt`. With `.optional()`, this works on old locks. If `depth` were truly required, `heartbeatLock` would throw on any lock file created before the field was added. The RFC doesn't address this interaction.

2. **`readAllLocks` and `removeStaleLock` also parse with the schema** (`lock.ts:150`, `lock.ts:164`). Same concern as above — a required `depth` field would cause these to throw on old lock files, breaking `werkstatt.lock.status` and `werkstatt.lock.recover` commands.

3. **Concurrent re-entrant acquire race condition.** If the same process calls `acquireLock` concurrently (e.g., two async sub-commands running in parallel within `release.prepare`), both read the lock file before either writes. The `depth` increment is not atomic — one increment could be lost. The RFC doesn't address concurrent re-entrant acquisition within the same process (as opposed to sequential nested acquisition).

## Questions for the author

1. Should the schema declare `depth` as required (matching the RFC text) or optional (matching the current code)? If required, the implementation must be updated to: (a) set `depth: 1` on new lock creation, (b) remove `?? 1` fallbacks, (c) update tests to expect `depth: 1` instead of `undefined`, (d) accept that old lock files without `depth` will be treated as corrupt. If optional, the RFC text, failure modes, rollout, and acceptance criteria must be rewritten to match.

2. Is concurrent re-entrant acquisition within the same process a realistic scenario (e.g., parallel pipeline phases), and if so, should the file read-modify-write be made atomic (e.g., via `O_EXCL` temp file + rename)?

3. Should `packages/forge/AGENTS.md` be updated with a re-entrant lock behavior rule, and should this be an acceptance criterion?
