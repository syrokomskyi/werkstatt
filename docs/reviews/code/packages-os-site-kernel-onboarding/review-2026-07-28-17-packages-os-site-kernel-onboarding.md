---
reviewId: REVIEW-CODE-2026-07-28-01
date: 2026-07-28
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 9d493c2...HEAD
filesReviewed:
  - packages/os/site-kernel-onboarding/src/config-regenerate.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/share/src/text-normalize.ts
---

# Code Review: 9d493c2...HEAD (RFC-0571 implementation)

### Verdict: Approved

The diff is a minimal, well-scoped implementation of RFC-0571. The path resolution change correctly replaces a hardcoded `apps/` path with the mission-aware `requireAstroSitePaths` resolver, dead code is properly removed, and the pipeline placement is correct. The pre-existing `import.meta.env.DEV` type error fix in `text-normalize.ts` is consistent with the existing codebase pattern.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-onboarding build:check` and `pnpm --filter @warpgogol/site-kernel-checks build:check` both exit 0. `rfc.validate RFC-0571` passes with 0 violations.

### Axis A — Structural correctness

No issues. Dead `pathExists` function and `access` import properly removed. `join` and `dirname` imports retained — still used for file path construction. Error message updated to reference resolved `appDir` instead of hardcoded `apps/`. No magic numbers, no untyped data, no Fowler smells.

### Axis B — DNA alignment

No issues. `site-kernel-onboarding` imports from `site-kernel-astro` (both `packages/os/*`) — correct package boundary direction (DNA-1). `CHANGE_SUMMARY` blocks updated with RFC-0571 references in both modified files (DNA-42). The change supports DNA-44 (platform-owned files materialized at build time) and DNA-47 (runtime scaffolding stays current via `build.prepare`).

### Axis C — Ecosystem fit

No issues. `config.regenerate` placed as first step in `SITES_BUILD_PREPARE_PIPELINE` — justified because root config files must be regenerated before any validation or codegen runs. No new commands introduced. No AGENTS.md updates needed — the existing description is already generic.

### Axis D — Forward-only compliance

No issues. Hardcoded `apps/` path removed, not maintained behind a flag. `pathExists` function deleted. No compatibility shim or dual-path. The `apps/` directory is retired (RFC-0381) — the code reflects current reality.

### Axis E — Agent-facing clarity

No issues. `CHANGE_SUMMARY` entries reference RFC-0571. Variable names are clear (`appDir`, `tokens`, `generated`, `skipped`). The `process.env.NODE_ENV !== "production"` replacement for `import.meta.env.DEV` is consistent with the pattern in `resolve-route.ts:558` and works in both Vite and Node contexts.

### Axis F — Pragmatism

No issues. No new commands — fixes an existing one. Minimal change: 5 lines changed in `config-regenerate.ts`, 2 lines added in `build-prepare.ts`, 1 line fixed in `text-normalize.ts`. No speculative generality.

### Axis G — Blind spots

No issues. `config.regenerate` writes 5 files — negligible performance cost. `requireAstroSitePaths` throws if `context.site` is null — correct fail-fast behavior. The `process.env.NODE_ENV` fix resolves a pre-existing type error that blocked `site-kernel-checks` build:check.

### Spec compliance

No spec available — spec compliance skipped. The RFC-0571 acceptance criteria serve as the spec; all 8 are verified with evidence.

### Questions for the author

None.
