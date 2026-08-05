---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: bcbab5b0...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/evidence/evidence-sync.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/adrs/adr-0025-require-progress-logging-for-long-running-pipeline-steps.md
---

# Code Review: bcbab5b0...HEAD (ADR-0025 implementation)

### Verdict: Needs revision

One finding on Axis A: the "upload loop complete" log line in the `finally` block can fire on error, producing a misleading success-like message when the upload actually failed.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` (tsc --noEmit) passed with 0 errors. 15/15 existing tests pass. `adr.validate --id ADR-0025` passed.

### Axis A — Structural correctness

**Finding A-1: "upload loop complete" log fires on error path.**

The `finally` block at `evidence-sync.ts:212-219` logs "upload loop complete" whenever `uploadedFiles.length > lastProgressIndex`. However, the `finally` block also runs when the inner `catch` block at line 195 returns on `R2_UPLOAD_ERROR`. If some files were uploaded before the error (and no heartbeat fired yet, so `lastProgressIndex` is 0), the "complete" message is logged even though the upload failed.

```typescript
// evidence-sync.ts:184-219
try {
  for (const relPath of relativeFiles) {
    // ...
    try {
      await client.putObject(...)
      uploadedFiles.push(relPath);
    } catch (err) {
      return { exitCode: 1, summary: `R2_UPLOAD_ERROR: ...` };
    }
  }
} finally {
  clearInterval(heartbeat);
  if (uploadedFiles.length > lastProgressIndex) {
    context.logger.info(
      `[evidence.sync] upload loop complete — ${uploadedFiles.length}/${relativeFiles.length} files`,
    );
  }
}
```

The `return` inside the `catch` triggers the `finally` block before the function returns. If e.g. 3 files uploaded successfully and the 4th fails, the `finally` block logs "upload loop complete — 3/10 files" — which reads as success to an agent monitoring console output.

**Fix**: Track whether the loop completed successfully with a boolean flag, or move the "complete" log to after the `try/finally` block (outside `finally`, before the normal return at line 220+).

### Axis B — DNA alignment

No issues. No DNA invariants reference logging or progress output. The change is purely additive and does not touch any invariant-governed area.

### Axis C — Ecosystem fit

No issues. `AGENTS.md` (handoff) updated with the ADR-0025 convention rule. No new commands, no pipeline changes, no Compass XML impact. The `CHANGE_SUMMARY` in `evidence-sync.ts` correctly references ADR-0025.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy behavior preserved behind flags.

### Axis E — Agent-facing clarity

No issues beyond A-1. `CHANGE_SUMMARY` updated, ADR-0025 referenced in code comment, log messages include context (file count, elapsed time, prefix).

### Axis F — Pragmatism

No issues. The heartbeat is minimal — `setInterval` + `clearInterval` with no new abstractions. The 30s interval matches the ADR requirement. No over-engineering.

### Axis G — Blind spots

No issues beyond A-1. Edge case: empty file list — heartbeat fires with "0/0 files done" (harmless). Edge case: upload completes in <30s — heartbeat never fires, "complete" logs correctly (if A-1 is fixed). Performance: `setInterval` every 30s is negligible.

### Spec compliance

| Requirement from ADR-0025 | Status | Evidence |
| --- | --- | --- |
| Commands >10s MUST emit progress every 30s | Done | `evidence-sync.ts:176` — `setInterval(..., 30_000)` |
| Convention enforced by code review, not runtime | Done | AGENTS.md (handoff) rule added |
| evidence.sync is first adopter | Done | Heartbeat added to R2 upload loop |
| mission.check already has progress | N/A | Not modified in this diff — ADR claims it exists |

### Questions for the author

1. Should the "upload loop complete" message be suppressed on the error path? Currently it can fire when `R2_UPLOAD_ERROR` triggers a return through the `finally` block.
