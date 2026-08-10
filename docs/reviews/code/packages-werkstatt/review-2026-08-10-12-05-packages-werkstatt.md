---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 0df07942...HEAD
filesReviewed:
  - packages/werkstatt/src/sternsystem/registry-io.ts
  - packages/werkstatt/src/sternsystem/external-edit-collector.ts
---

# Code Review: 0df07942...HEAD (ADR-0040 JSDoc return-type contracts)

### Verdict: Approved

The diff adds JSDoc `@returns` contracts to four path-returning functions in `packages/werkstatt/src/sternsystem/`. The change is documentation-only (no runtime behavior change), directly implements ADR-0040's decision, and follows the existing JSDoc culture in the package. Zero findings across all axes.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` (tsc --noEmit) exit 0.

### Axis A — Structural correctness

No issues. The JSDoc blocks are syntactically valid, placed directly above the function declarations, and do not interfere with existing code structure. No new abstractions, no dead code, no magic numbers introduced.

### Axis B — DNA alignment

No issues. The change does not touch any DNA invariant. ADR-0040 is a package-scoped ADR (scope: package, decider: architecture) — it does not introduce or amend a DNA invariant.

### Axis C — Ecosystem fit

No issues. The JSDoc pattern aligns with the existing JSDoc culture in `packages/werkstatt/` where public API functions carry `@param` and `@returns` documentation. CHANGE_SUMMARY entries in both modified files reference ADR-0040, maintaining Compass traceability.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retained. The change is purely additive (JSDoc comments).

### Axis E — Agent-facing clarity

No issues. Each JSDoc block documents the three required elements per ADR-0040: (1) existence guarantee ("may not exist on disk"), (2) caller requirement ("MUST check with `existsSync`"), (3) semantic meaning ("computed" vs "discovered"). This directly addresses the class of bugs where a return type change from `T | null` to `T` silently breaks truthiness guards.

### Axis F — Pragmatism

No issues. The change is minimal — JSDoc comments only, no code logic changes. No new dependencies, no new abstractions. The advisory JSDoc approach is the lightest enforcement mechanism that addresses the root cause.

### Axis G — Blind spots

No issues. The JSDoc is advisory (not mechanically enforced), which ADR-0040 explicitly acknowledges in its Consequences section. The Evolution section documents the escalation path (branded type or ESLint rule) if the advisory approach proves insufficient.

### Spec compliance

| Requirement from ADR-0040 | Status | Evidence |
| --- | --- | --- |
| Every public path-returning function in sternsystem/ carries JSDoc | Done | 4 functions documented: resolveCacheClonePath, resolveWorkpiecePath, resolveMirrorPath (registry-io.ts), bordbuchPathFor (external-edit-collector.ts) |
| JSDoc documents existence guarantee | Done | "may not exist on disk" in all 4 JSDoc blocks |
| JSDoc documents existsSync requirement | Done | "Callers MUST check with `existsSync`" in all 4 JSDoc blocks |
| JSDoc documents computed vs discovered semantic | Done | "computed" in all 4 JSDoc blocks |
| Audit other path-returning functions | Done | Grep for `export function.*: string` across all .ts files in sternsystem/ found exactly these 4 path-returning functions. No others found. |

### Questions for the author

No questions — the diff is clean and fully implements the ADR decision.
