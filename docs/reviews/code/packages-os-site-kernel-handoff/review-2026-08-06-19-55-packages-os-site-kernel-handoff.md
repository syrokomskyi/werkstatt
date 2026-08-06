---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 2561f5b1...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - docs/adrs/adr-0031-sync-cache-clone-warn-on-dirty.md
---

# Code Review: 2561f5b1...HEAD

### Verdict: Approved

The diff implements ADR-0031 by adding a `git status --porcelain` check before `git reset --hard` in `syncCacheClone` and emitting `logger.warn` when the cache clone is dirty. The change is minimal, focused, and aligns with the package AGENTS.md convention that non-fatal warnings use `logger.warn`. No findings across any axis.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` (tsc --noEmit) passed with 0 errors. `adr.validate --id ADR-0031` passed with 0 violations.

### Axis A — Structural correctness

No issues. The `syncCacheClone` signature is widened from `{ info }` to `{ info, warn }` — the caller (`runMissionMaterialize`) destructures `logger` from `KernelRuntimeContext`, which already provides `warn`. The `git status --porcelain` call uses `execSync` with `encoding: "utf-8"` and `timeout: 10_000`, consistent with the surrounding `execSync` calls in the same function.

### Axis B — DNA alignment

No issues. No DNA invariants are touched by this change.

### Axis C — Ecosystem fit

No issues. The change is local to `syncCacheClone` in `packages/os/site-kernel-handoff`. No package boundaries, pipeline placement, or command lifecycle changes. The ADR-0031 comment in the code (`// ADR-0031: warn on uncommitted changes before hard reset`) provides traceability.

### Axis D — Forward-only compliance

No issues. The change replaces `logger.info` with `logger.warn` for the warning — no dual-path or compatibility shim. The previous `logger.info` warning is deleted, not maintained alongside.

### Axis E — Agent-facing clarity

No issues. The `// ADR-0031` comment links the code to the decision record. The warning message is descriptive and actionable: "Push to bare repo before materializing."

### Axis F — Pragmatism

No issues. The change adds one `git status` call (~10ms per the ADR's consequences section). No new commands, no new abstractions. The signature widening is the minimum needed to satisfy the `logger.warn` call.

### Axis G — Blind spots

No issues. The `git status --porcelain` timeout (10s) is generous enough for large repos. The warning is non-blocking — the reset proceeds regardless, maintaining cache clone integrity. False positives from generated files are noted in the ADR's Evolution section.

### Spec compliance

| Requirement from ADR-0031 | Status | Evidence |
| --- | --- | --- |
| Check for uncommitted changes before `git reset --hard` | Done | `mission-materialize.ts:390-394` — `execSync("git status --porcelain")` |
| Log `logger.warn` if dirty | Done | `mission-materialize.ts:396-398` — `logger.warn(...)` |
| Proceed with reset regardless | Done | `mission-materialize.ts:400-409` — fetch + reset continue after the warning |
| Use `git status --porcelain` | Done | `mission-materialize.ts:390` |

### Questions for the author

No questions — the diff is clean and fully implements the ADR decision.
