---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 49f2a3f7~1...49f2a3f7
filesReviewed:
  - packages/werkstatt/src/leitstand/leitstand-commands.ts
  - packages/werkstatt/src/sternsystem/registry-io.ts
  - packages/werkstatt/src/werkstatt/git-exec.ts
  - packages/werkstatt/src/werkstatt/werkstatt-commit.ts
---

# Code Review: 49f2a3f7~1...49f2a3f7

### Verdict: Needs revision

The diff fixes three real lifecycle bugs with minimal changes. Two findings require attention: a bare `catch` block that swallows push errors without logging (Axis A), and a missing `CHANGE_SUMMARY` entry for the `gitExec` env parameter extension (Axis E).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` exits 0.

### Axis A — Structural correctness

**Finding A-1 (minor):** `registry-io.ts:160-167` — bare `catch` block swallows push errors without any logging context. The comment says "Push may fail if no bare repo is configured — non-fatal" but provides no diagnostic trace. If the push fails for a real reason (e.g. branch divergence, auth issue), the operator has no way to distinguish "no bare repo" from "real failure". Add a `logger.warn` or at minimum `console.error` with the error message inside the catch.

**Finding A-2 (cosmetic):** `registry-io.ts:155` — `execSync("git rev-parse --abbrev-ref HEAD", ...)` uses raw `execSync` instead of the package's `gitExec` helper. This bypasses the centralized timeout/error handling in `gitExec`. Use `gitExec(cacheClone, "rev-parse --abbrev-ref HEAD")` for consistency.

### Axis B — DNA alignment

No issues. The changes align with DNA-44 (Sternsystem bundle contract — ensures `system-state.yaml` durability) and DNA-45 (Fleet registry — ensures `discoverSystems` reliability). DNA-46 (Mission lifecycle) — the fixes support the mission lifecycle by ensuring state persistence across `syncCacheClone` resets.

### Axis C — Ecosystem fit

No issues. All changes are within `@warpgogol/werkstatt`. No cross-package boundary violations. No new commands — changes are internal to existing functions.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual paths. The fixes directly change existing behavior.

### Axis E — Agent-facing clarity

**Finding E-1 (minor):** `git-exec.ts` — the `CHANGE_SUMMARY` comment block does not mention the new `env` parameter added to `gitExec` and `gitExecWithRetry`. The Compass scaffolding should be updated to record this API extension.

**Finding E-2 (cosmetic):** `registry-io.ts:150` — the comment says "RFC-0790: Push to bare repo..." but should reference "RFC-0794" since that is the RFC that documents this fix. RFC-0790 is the amended RFC, not the one that introduced the push.

### Axis F — Pragmatism

No issues. Changes are minimal and targeted. No speculative generality. The `env` parameter on `gitExec` is the minimal extension needed.

### Axis G — Blind spots

No issues. Push performance is local and fast. The non-fatal catch handles the "no bare repo" edge case. The archive fallback handles the "mission already closed" edge case. The `ECOSYSTEM_COMMIT=1` env var is scoped to `commitWerkstattSideEffects` only.

### Spec compliance

| Requirement from RFC-0794 | Status | Evidence |
| --- | --- | --- |
| Push system-state to bare repo | Done | `registry-io.ts:150-167` |
| Archive evidence fallback | Done | `leitstand-commands.ts:1647-1674` |
| ECOSYSTEM_COMMIT=1 env var | Done | `werkstatt-commit.ts:47-49` |
| gitExec env parameter | Done | `git-exec.ts:17-36` |
| computeInputsHash skip missing files | Not in this diff | Separate commit `5.18.15` |

### Questions for the author

1. Should the bare `catch` in `writeSystemState`'s push step log the error for diagnosability? (A-1)
2. Should `gitExec` be used instead of raw `execSync` for the branch name lookup? (A-2)
