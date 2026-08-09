---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: a9e9feed...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/pipelines/build-prepare.ts
---

# Code Review: a9e9feed...HEAD (build-prepare.ts)

### Verdict: Approved

The diff is a minimal, well-justified pipeline adjustment: two `public/`-producing generators are removed from the dev pipeline with a clear explanatory comment and CHANGE_SUMMARY entry. No structural, DNA, ecosystem, forward-only, or pragmatism issues.

### Mechanical floor

Pass (for the reviewed file). Pre-existing TypeScript errors in `src/domain/share/` are unrelated to this change — confirmed via `git stash` test showing identical errors without the change.

### Axis A — Structural correctness

No issues. The change removes two entries from a `KernelPipelineStep[]` array and adds a comment. No type changes, no dead code, no unjustified removals (RFC-0787 documents the rationale).

### Axis B — DNA alignment

No issues. DNA-58 (generated-file determinism) is not affected — the production pipeline ordering is unchanged, only the dev pipeline subset is trimmed.

### Axis C — Ecosystem fit

No issues. The dev pipeline correctly excludes `public/`-producing generators. No package boundaries, command lifecycle, or Compass sync changes.

### Axis D — Forward-only compliance

No issues. Clean removal — no compatibility shims, no dual paths, no flags.

### Axis E — Agent-facing clarity

No issues. CHANGE_SUMMARY entry added with RFC-0787 reference. Inline comment explains the removal rationale.

### Axis F — Pragmatism

No issues. The change is as minimal as possible: two lines removed, one comment added, one CHANGE_SUMMARY entry. No scope creep.

### Axis G — Blind spots

No issues. Removing generators from the dev pipeline improves dev startup time. `agent.enabled: false` sites are unaffected (generators skip internally). No migration needed — existing apps automatically benefit.

### Spec compliance

| Requirement from RFC-0787 | Status | Evidence |
| --- | --- | --- |
| Remove agent.api-catalog.generate from dev pipeline | Done | build-prepare.ts:198-199 |
| Remove agent.mcp-card.generate from dev pipeline | Done | build-prepare.ts:198-199 |
| Document the removal rationale | Done | build-prepare.ts:198-199 comment + CHANGE_SUMMARY line 23 |

### Questions for the author

No questions — the change is self-explanatory and matches the RFC's acceptance criteria.
