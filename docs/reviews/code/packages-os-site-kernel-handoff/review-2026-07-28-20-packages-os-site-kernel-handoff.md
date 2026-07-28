---
reviewId: REVIEW-CODE-2026-07-28-02
date: 2026-07-28
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 832cf5f...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-preview.ts
---

# Code Review: 832cf5f...HEAD (ADR-0007 fix)

### Verdict: Approved

The fix replaces the fragile subprocess call with a direct in-process call to `runContentRefIndexGenerate`, resolving both findings from the previous review (A-1: swallowed error, G-2: site resolver fails for closed missions).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` exits 0.

### Axis A — Structural correctness

No issues. The `try/catch` properly catches errors and logs a warning with context. The synthetic `DiscoveredSiteWorkspace` is correctly constructed with `name`, `directory`, and `toolsDirectory`.

### Axis B — DNA alignment

No issues.

### Axis C — Ecosystem fit

No issues. Import from `@warpgogol/site-kernel-codegen` is valid — the package is already a dependency. The in-process call pattern is consistent with how other mission commands (e.g. `mission.materialize`) call kernel commands directly.

### Axis D — Forward-only compliance

No issues. The subprocess approach is fully replaced — no dual path.

### Axis E — Agent-facing clarity

No issues. Compass headers already reference ADR-0007. Inline comments explain why the in-process approach is used instead of `--site` flag.

### Axis F — Pragmatism

No issues. Minimal change, reuses existing export, no new abstractions.

### Axis G — Blind spots

No issues. The `try/catch` with `logger.warn` ensures failures are visible to the operator without blocking the dev server. The synthetic site context correctly points to the workpiece directory, working for all mission states.

### Spec compliance

| Requirement from ADR-0007 | Status | Evidence |
| --- | --- | --- |
| Run `content.ref-index.generate` before dev server start | Done | `mission-preview.ts:86-89` |
| Scope limited to `content.ref-index.generate` | Done | No other `build.prepare` steps invoked |
| Generation runs against workpiece directory | Done | Synthetic `workpieceSite` with `directory: workpiecePath` at line 80-84 |

### Questions for the author

None.
